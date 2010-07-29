var net = require('net'),
    fs = require('fs'),
    crypto = require('crypto');

var privateKey = fs.readFileSync('CA/newkeyopen.pem', 'ascii');
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

function StompStreamHandler(stream) {
    var frameBuffer = new StompFrameBuffer(this);
    console.log('Secure Connection Established');
    stream.on('data', function (data) {
        frameBuffer.handleData(data);
    });
    stream.on('end', function () {
        stream.end();
    });
};

function StompFrameBuffer(streamHandler) {
    this.isAuthenticated = false;
    this.streamHandler = streamHandler;
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
    do {
        if (this.state == ParserStates.COMMAND) {
            this.parseCommand();
        }
        if (this.state == ParserStates.HEADERS) {
            this.parseHeaders();
        }
        if (this.state == ParserStates.BODY) {
            this.parseBody();
        }
    } while (this.state == ParserStates.COMMAND && this.hasLine());
};

StompFrameBuffer.prototype.hasLine = function() {
    return (this.buffer.indexOf('\n') > -1);
};

StompFrameBuffer.prototype.popLine = function () {
    var index = this.buffer.indexOf('\n');
    var line = this.buffer.slice(0, index);
    this.buffer = this.buffer.substr(index + 1);
    return line;
};

StompFrameBuffer.prototype.parseCommand = function() {
    while (this.hasLine()) {
        var line = this.popLine();
        // TODO: Make sure the line is a valid command
        if (line != '') {
            this.request.setCommand(line);
            this.incrementState();
            break;
        }
    }
};

StompFrameBuffer.prototype.parseHeaders = function() {
    while (this.hasLine()) {
        var line = this.popLine();
        if (line == '') {
            this.incrementState();
            break;
        }
        else {
            var kv = line.split(':', 2);
            this.request.setHeader(kv[0], kv[1]);
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
        this.request = new Request();
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
        new StompStreamHandler(stream);
    });
});

server.listen(8124, 'localhost');
