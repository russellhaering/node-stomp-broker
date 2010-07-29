var net = require('net'),
    fs = require('fs'),
    crypto = require('crypto');

var privateKey = fs.readFileSync('CA/newkey.pem', 'ascii');
var certificate = fs.readFileSync('CA/newcert.pem', 'ascii');
var certificateAuthority = fs.readFileSync('CA/demoCA/private/cakey.pem', 'ascii');
var credentials = crypto.createCredentials({
    key: privateKey,
    cert: certificate,
    ca: certificateAuthority,
});

var ParserStates = {
    COMMAND: 0,
    HEADERS: 1,
    BODY: 2,
};

function StompFrameBuffer() {
    this.isAuthenticated = false;
    this.state = ParserStates.COMMAND;
    this.request = new Request();
    this.frames = [];
    this.buffer = '';
}

StompFrameBuffer.prototype.incrementState = function() {
    if (this.state == ParserStates.BODY){
        this.state = ParserStates.COMMAND;
    }
    else {
        this.state++;
    }
};

StompFrameBuffer.prototype.handleData = function(data) {
    console.log('Handling Data');
    this.buffer += data;
    if (this.state == ParserStates.COMMAND) {
        this.parseCommand();
    }
    if (this.state == ParserStates.HEADERS) {
        this.parseHeaders();
    }
    if (this.state == ParserStates.BODY) {
        this.parseBody();
    }
    // TODO: Loop back if another command is in the buffer
};

StompFrameBuffer.prototype.parseCommand = function() {
    var index = this.buffer.indexOf('\n');
    if (index > -1) {
        this.request.setCommand(this.buffer.slice(0, index));
        this.buffer = this.buffer.substr(index + 1);
        this.incrementState();
    }
};

StompFrameBuffer.prototype.parseHeaders = function() {
    while (true) {
        var index = this.buffer.indexOf('\n');
        if (index > -1) {
            // TODO: If ':' isn't in this line we need to error out
            var line = this.buffer.slice(0, index);
            if (line == '') {
                // Thats two newlines in a row, end of the headers detected
                this.buffer = this.buffer.substr(1);
                this.incrementState();
                return;
            }
            else {
                var kv = this.buffer.slice(0, index).split(':', 2);
                this.request.setHeader(kv[0], kv[1]);
                this.buffer = this.buffer.substr(index + 1);
            }
        }
        else {
            break;
        }
    }
};

StompFrameBuffer.prototype.parseBody = function() {
    if (this.request.contentLength > -1) {
        var remainingLength = this.request.contentLength - this.request.body.length;
        this.request.appendToBody(this.buffer.slice(0, remainingLength));
        this.buffer = this.buffer.substr(remainingLength);
        if (this.request.contentLength == this.request.body.length) {
            this.request.contentLength = -1;
        }
        else {
            return;
        }
    }
    var index = this.buffer.indexOf('\0');
    if (index == -1) {
       this.request.appendToBody(this.buffer);
       this.buffer = '';
    }
    else {
        this.request.appendToBody(this.buffer.slice(0, index));
        console.log('Parsed Request: ' + this.request);
        this.incrementState();
        this.buffer = this.buffer.substr(index + 1);
    }
};

function Request() {
    this.command = '';
    this.headers = {};
    this.body = '';
    this.contentLength = -1;
}

Request.prototype.toString = function() {
    return JSON.stringify({
        command: this.command,
        headers: this.headers,
        body: this.body,
    });
};

Request.prototype.setCommand = function(command) {
    this.command = command;
};

Request.prototype.setHeader = function(key, value) {
    this.headers[key] = value;
    if (key.toLowerCase() == 'content-length') {
        this.contentLength = parseInt(value);
    }
};

Request.prototype.appendToBody = function(data) {
    this.body += data;
};

function Queue() {
    this.sessions = [];
}

function QueueManager() {
    this.queues = {};
}

var server = net.createServer(function (stream) {
    stream.on('connect', function () {
        console.log('Received Connection, securing');
        stream.setSecure(credentials);
    });
    stream.on('secure', function () {
        var frameBuffer = new StompFrameBuffer();
        console.log('Secure Connection Established');
        stream.on('data', function (data) {
            frameBuffer.handleData(data);
        });
        stream.on('end', function () {
            stream.end();
        });
    });
});

server.listen(8124, 'localhost');
