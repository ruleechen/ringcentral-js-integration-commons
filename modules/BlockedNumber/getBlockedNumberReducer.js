'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getStatusReducer = getStatusReducer;
exports.getErrorReducer = getErrorReducer;
exports.default = getAccountInfoReducer;

var _redux = require('redux');

var _Enum = require('../../lib/Enum');

var _blockedNumberActionTypes = require('./blockedNumberActionTypes');

var _blockedNumberActionTypes2 = _interopRequireDefault(_blockedNumberActionTypes);

var _blockedNumberStatus = require('./blockedNumberStatus');

var _blockedNumberStatus2 = _interopRequireDefault(_blockedNumberStatus);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getStatusReducer(prefix) {
  var types = (0, _Enum.prefixEnum)({ enumMap: _blockedNumberActionTypes2.default, prefix: prefix });
  return function () {
    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _blockedNumberStatus2.default.pending;
    var _ref = arguments[1];
    var type = _ref.type;

    switch (type) {
      case types.fetch:
        return _blockedNumberStatus2.default.fetching;

      case types.init:
      case types.fetchSuccess:
        return _blockedNumberStatus2.default.ready;

      case types.fetchError:
        return _blockedNumberStatus2.default.error;

      case types.reset:
        return _blockedNumberStatus2.default.pending;
      default:
        return state;
    }
  };
}

function getErrorReducer(prefix) {
  var types = (0, _Enum.prefixEnum)({ enumMap: _blockedNumberActionTypes2.default, prefix: prefix });
  return function () {
    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    var _ref2 = arguments[1];
    var type = _ref2.type,
        error = _ref2.error;

    switch (type) {
      case types.init:
      case types.fetch:
      case types.fetchSuccess:
      case types.reset:
        return null;

      case types.fetchError:
        return error;

      default:
        return state;
    }
  };
}

function getAccountInfoReducer(prefix) {
  return (0, _redux.combineReducers)({
    status: getStatusReducer(prefix),
    error: getErrorReducer(prefix)
  });
}
//# sourceMappingURL=getBlockedNumberReducer.js.map