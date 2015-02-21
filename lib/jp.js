#!/usr/bin/env node

/*
 * BSD 3-Clause License
 *
 * Copyright (c) 2015, Nicolas Riesco and others as credited in the AUTHORS file
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 * may be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 */

/**
 * @module jp
 *
 * @description Module `jp` provides class `Message` to create, parse and reply
 * to messages of the IPython/Jupyter protocol.
 *
 * @example
 *
 * // Example of parsing and replying to a message:
 * this.shellSocket.on("message", (function() {
 *     // parse the request message
 *     var request = new Message(
 *         arguments,
 *         "sha256",
 *         "f388c63a-9fb9-4ee9-83f0-1bb790ffc7c7"
 *     );
 *
 *     // check the request signature is valid
 *     if (!msg.signatureOK) return;
 *
 *     // do something with the request
 *     var msg_type = request.header.msg_type;
 *     var content = request.content;
 *
 *     // set up the response msg_type and content
 *     // ..
 *
 *     // respond
 *     request.respond(this.shellSocket, msg_type, content);
 * }).bind(this));
 *
 */
module.exports.Message = Message;

var DEBUG = false;

var console = require("console");
var crypto = require("crypto");
var uuid = require("node-uuid");

/**
 * @class
 * @classdesc Implements an IPython message
 *
 * @param {argsArray} [requestArguments] argsArray of the callback listening on
 * the {@link Kernel#shellSocket Shell socket}
 * @param {string}    [scheme=sha256]    Hashing scheme
 * @param {string}    [key=""]           Hashing key
 */
function Message(requestArguments, scheme, key) {
    this.idents = undefined;
    this.delimiter = undefined;
    this.signature = undefined;
    this.header = undefined;
    this.parentHeader = undefined;
    this.metadata = undefined;
    this.content = undefined;
    this.blob = undefined;

    this.scheme = scheme || "sha256";
    this.key = key || "";
    this.signatureOK = undefined;

    if (requestArguments !== undefined) {
        this.parse(requestArguments);
    }
}

/**
 * Parse a request
 *
 * @param {argsArray} requestArguments argsArray of the callback listening on
 * the {@link Kernel#shellSocket Shell socket}
 */
Message.prototype.parse = function(requestArguments) {
    var hmac = crypto.createHmac(this.scheme, this.key);
    hmac.update(requestArguments[3]);
    hmac.update(requestArguments[4]);
    hmac.update(requestArguments[5]);
    hmac.update(requestArguments[6]);
    this.signature = requestArguments[2].toString();
    this.signatureOK = (this.signature === hmac.digest("hex"));

    if (!this.signatureOK) return;

    function toString(value) {
        if (value === undefined || value === null) {
            return value;
        }
        return value.toString();
    }

    function toJSON(value) {
        if (value === undefined || value === null) {
            return value;
        }
        return JSON.parse(value.toString());
    }

    this.idents = toString(requestArguments[0]);
    this.delimiter = toString(requestArguments[1]);

    this.header = toJSON(requestArguments[3]);
    this.parentHeader = toJSON(requestArguments[4]);
    this.metadata = toString(requestArguments[5]);
    this.content = toJSON(requestArguments[6]);
    this.blob = toString(requestArguments[7]);

    if (DEBUG) console.log("JP: REQUEST:", this);
};

/**
 * Send a response
 *
 * @param {module:zmq~Socket} socket Socket over which the response is sent
 * @param {string} messageType Type of message as specified by IPython protocol
 * @param {object} content     Response content as specified by IPython protocol
 */
Message.prototype.respond = function(socket, messageType, content) {
    var idents = this.idents;
    var delimiter = this.delimiter;
    var header = JSON.stringify({
        msg_id: uuid.v4(),
        username: this.header.username,
        session: this.header.session,
        msg_type: messageType,
    });
    var parentHeader = JSON.stringify(this.header);
    var metadata = JSON.stringify({});
    content = JSON.stringify(content);

    var hmac = crypto.createHmac(this.scheme, this.key);
    hmac.update(header);
    hmac.update(parentHeader);
    hmac.update(metadata);
    hmac.update(content);
    var signature = hmac.digest("hex");

    if (DEBUG) console.log("JP: RESPONSE:", [
        idents, // idents
        delimiter, // delimiter
        signature, // HMAC signature
        header, // header
        parentHeader, // parent header
        metadata, // metadata
        content, // content
    ]);

    socket.send([
        idents, // idents
        delimiter, // delimiter
        signature, // HMAC signature
        header, // header
        parentHeader, // parent header
        metadata, // metadata
        content, // content
    ]);
};