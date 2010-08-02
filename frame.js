function StompFrame(frame) {
    if (frame == undefined) {
        frame = {};
    }
    this.command = frame.command || '';
    this.headers = frame.headers || {};
    this.body = frame.body || '';
    this.contentLength = -1;
};

StompFrame.prototype.toString = function() {
    return JSON.stringify({
        command: this.command,
        headers: this.headers,
        body: this.body,
    });
};

StompFrame.prototype.send = function(stream) {
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

StompFrame.prototype.setCommand = function(command) {
    this.command = command;
};

StompFrame.prototype.setHeader = function(key, value) {
    this.headers[key] = value;
    if (key.toLowerCase() == 'content-length') {
        this.contentLength = parseInt(value);
    }
};

StompFrame.prototype.appendToBody = function(data) {
    this.body += data;
};

exports.StompFrame = StompFrame;
