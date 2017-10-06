'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var debug = require("debug");
var assert_1 = require("assert");
var logger = debug('json-rpc-ws');
// var assert = require('assert').ok;
/*
 * http://www.jsonrpc.org/specification#error_object
 */
var Errors = /** @class */ (function () {
    /**
     *
     */
    function Errors() {
        this.parseError = { code: -32700, message: 'Parse error' };
        this.invalidRequest = { code: -32600, message: 'Invalid Request' };
        this.methodNotFound = { code: -32601, message: 'Method not found' };
        this.invalidParams = { code: -32602, message: 'Invalid params' };
        this.internalError = { code: -32603, message: 'Internal error' };
        this.serverError = { code: -32000, message: 'Server error' };
    }
    return Errors;
}());
var errors = new Errors();
/**
 * Returns a valid jsonrpc2.0 error reply
 *
 * @param {String} type - type of error
 * @param {Number|String|null} id - optional id for reply message
 * @param {Any} data - optional data attribute for error message
 * @returns {Object|null} mreply object that can be sent back
 */
function getError(type, id, data) {
    assert_1.ok(errors[type], 'Invalid error type ' + type);
    var payload = {
        error: errors[type],
    };
    if (typeof id === 'string' || typeof id === 'number') {
        payload.id = id;
    }
    if (typeof data !== 'undefined') {
        payload.error.data = data;
    }
    logger('error %j', payload);
    return payload;
}
exports.default = getError;
;
//# sourceMappingURL=errors.js.map