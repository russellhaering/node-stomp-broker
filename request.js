function StompRequest() {
    this.command = '';
    this.headers = {};
    this.body = '';
    this.contentLength = -1;
}

StompRequest.prototype.toString = function() {
    return JSON.stringify({
        command: this.command,
        headers: this.headers,
        body: this.body,
    });
};

StompRequest.prototype.send = function(stream) {
    stream.write(this.command + '\n');
    for (var key in this.headers) {
        stream.write(key + ':' + this.headers[key] + '\n');
    }
    if (this.body.length > 0) {
        stream.write('content-length:' + this.body.length + '\n');
    }
    stream.write('\n');
    if (this.body.length > 0) {
        stream.write(this.body);
    }
    stream.write('\0');
};

StompRequest.prototype.setCommand = function(command) {
    this.command = command;
};

StompRequest.prototype.setHeader = function(key, value) {
    this.headers[key] = value;
    if (key.toLowerCase() == 'content-length') {
        this.contentLength = parseInt(value);
    }
};

StompRequest.prototype.appendToBody = function(data) {
    this.body += data;
};

exports.StompRequest = StompRequest;
