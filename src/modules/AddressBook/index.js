import Pollable from '../../lib/Pollable';
import sleep from '../../lib/sleep';
import syncTypes from '../../enums/syncTypes';
import actionTypes from './actionTypes';
import proxify from '../../lib/proxy/proxify';

import getAddressBookReducer, {
  getSyncTokenReducer,
  getContactListReducer,
  getSyncTimestampReducer,
} from './getAddressBookReducer';

const CONTACTS_PER_PAGE = 250;
const DEFAULT_TTL = 30 * 60 * 1000;
const DEFAULT_TIME_TO_RETRY = 62 * 1000;
const REGX_DECODE = /&\w+;/g;
const DECODE = {
  '&amp;': '&',
  '&bsol;': '\\',
  '&sol;': '/',
  '&apos;': '\''
};

function getSyncParams(syncToken, pageId) {
  const query = {
    perPage: CONTACTS_PER_PAGE,
  };
  if (syncToken) {
    query.syncToken = syncToken;
    query.syncType = syncTypes.iSync;
  } else {
    query.syncType = syncTypes.fSync;
  }
  if (pageId) {
    query.pageId = pageId;
  }
  return query;
}

/**
 * @class
 * @description Accound book module to get user person contacts in RC
 */
export default class AddressBook extends Pollable {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Client} params.client - client module instance
   * @param {Auth} params.auth - Auth module instance
   * @param {Storage} params.storage - storage module instance
   * @param {Number} params.ttl - local cache timestamp, default 30 mins
   * @param {Number} params.timeToRetry - timestamp to retry, default 62 seconds
   * @param {Bool} params.polling - polling flag, default true
   */
  constructor({
    client,
    auth,
    storage,
    ttl = DEFAULT_TTL,
    timeToRetry = DEFAULT_TIME_TO_RETRY,
    polling = true,
    ...options
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._client = client;
    this._storage = storage;
    this._auth = auth;
    this._ttl = ttl;
    this._timeToRetry = timeToRetry;
    this._polling = polling;
    this._promise = null;
    this._syncTokenStorageKey = 'contactsSyncToken';
    this._syncTimestampStorageKey = 'contactsSyncTimestamp';
    this._addressBookStorageKey = 'addressBookContactsList';
    this._reducer = getAddressBookReducer(this.actionTypes);
    this._storage.registerReducer({
      key: this._syncTokenStorageKey,
      reducer: getSyncTokenReducer(this.actionTypes),
    });
    this._storage.registerReducer({
      key: this._syncTimestampStorageKey,
      reducer: getSyncTimestampReducer(this.actionTypes),
    });
    this._storage.registerReducer({
      key: this._addressBookStorageKey,
      reducer: getContactListReducer(this.actionTypes),
    });
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  async _onStateChange() {
    if (this._shouldInit()) {
      this.store.dispatch({
        type: this.actionTypes.init,
      });
      if (this._shouleCleanCache()) {
        this._cleanUp();
      }
      await this._initAddressBook();
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (this._shouldReset()) {
      this._resetModuleStatus();
    }
  }

  _shouldInit() {
    return (
      this._storage.ready &&
      this._auth.loggedIn &&
      this.pending
    );
  }

  _shouldReset() {
    return (
      (
        !this._storage.ready ||
        !this._auth.loggedIn
      ) &&
      this.ready
    );
  }

  _shouleCleanCache() {
    return (
      this._auth.isFreshLogin ||
      !this.timestamp ||
      (Date.now() - this.timestamp) > this._ttl
    );
  }

  async _initAddressBook() {
    try {
      await this.sync();
    } catch (e) {
      console.error(e);
    }
  }

  _resetModuleStatus() {
    this.store.dispatch({
      type: this.actionTypes.reset,
    });
    this._clearTimeout();
    this._promise = null;
    this.store.dispatch({
      type: this.actionTypes.resetSuccess,
    });
  }
  @proxify
  async sync() {
    if (!this._promise) {
      this._promise = (async () => {
        try {
          this.store.dispatch({
            type: this.actionTypes.sync,
          });
          const response = await this._sync(this.syncToken);
          this.store.dispatch({
            type: this.actionTypes.syncSuccess,
            records: response.records,
            syncToken: response.syncInfo.syncToken,
            syncTime: response.syncInfo.syncTime,
          });
          if (this._polling) {
            this._startPolling();
          }
        } catch (error) {
          this._onSyncError();
          if (this._polling) {
            this._startPolling(this.timeToRetry);
          } else {
            this._retry();
          }
          throw error;
        }
        this._promise = null;
      })();
    }
  }

  _onSyncError() {
    this.store.dispatch({
      type: this.actionTypes.syncError,
    });
  }

  @proxify
  async _sync(syncToken, pageId) {
    const params = getSyncParams(syncToken, pageId);
    const response = await this._syncAddressBookApi(params);
    if (!response.nextPageId) {
      return response;
    }
    await sleep(1000);
    const lastResponse = await this._sync(syncToken, response.nextPageId);
    return {
      ...lastResponse,
      records: response.records.concat(lastResponse.records),
    };
  }
  @proxify
  async _syncAddressBookApi(params) {
    const updateRequest = await this._client
      .account()
      .extension()
      .addressBookSync()
      .list(params);
    this._decodeAddressBook(updateRequest);
    return updateRequest;
  }

  _decode(text) {
    return text.replace(REGX_DECODE, ($0) => {
      let handleText = $0;
      if (DECODE[$0]) {
        handleText = DECODE[$0];
      }
      return handleText;
    });
  }

  _decodeAddressBook(origin) {
    if (origin && origin.records && Array.isArray(origin.records)) {
      origin.records.forEach((record) => {
        if (record.firstName) {
          record.firstName = this._decode(record.firstName);
        }
        if (record.lastName) {
          record.lastName = this._decode(record.lastName);
        }
      });
    }
  }

  _cleanUp() {
    this.store.dispatch({
      type: this.actionTypes.cleanUp,
    });
  }
  @proxify
  async fetchData() {
    await this.sync();
  }

  get status() {
    return this.state.status;
  }

  get syncToken() {
    return this._storage.getItem(this._syncTokenStorageKey);
  }

  get contacts() {
    return this._storage.getItem(this._addressBookStorageKey);
  }

  get timestamp() {
    return this._storage.getItem(this._syncTimestampStorageKey);
  }

  get ttl() {
    return this._ttl;
  }

  get timeToRetry() {
    return this._timeToRetry;
  }
}
