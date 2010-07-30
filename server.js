var net = require('net');
var fs = require('fs');
var crypto = require('crypto');
var sys = require('sys');
var events = require('events');

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
    ERROR: 3,
};

var StompClientCommands = [
    'CONNECT',
    'SEND',
    'SUBSCRIBE',
    'UNSUBSCRIBE',
    'BEGIN',
    'COMMIT',
    'ACK',
    'ABORT',
    'DISCONNECT',
];

function StompStreamHandler(stream) {
    var frameEmitter = new StompFrameEmitter();
    console.log('Secure Connection Established');
    stream.on('data', function (data) {
        frameEmitter.handleData(data);
    });
    stream.on('end', function () {
        stream.end();
    });
    frameEmitter.on('request', function(request) {
        console.log('Received Request: ' + request);
        if (request.command == 'CONNECT') {
            var response = new Request();
            response.setCommand('CONNECTED');
            response.setHeader('session', 'a');
            response.send(stream);
        }
    });
    frameEmitter.on('error', function(err) {
        var response = new Request();
        response.setCommand('ERROR');
        response.setHeader('message', err['message']);
        if ('details' in err) {
            response.appendToBody(err['details']);
        }
        response.send(stream);
    });
};

function StompFrameEmitter() {
    events.EventEmitter.call(this);
    this.state = ParserStates.COMMAND;
    this.request = new Request();
    this.frames = [];
    this.buffer = '';
};

sys.inherits(StompFrameEmitter, events.EventEmitter);

StompFrameEmitter.prototype.incrementState = function() {
    if (this.state == ParserStates.BODY || this.state == ParserStates.ERROR){
        this.state = ParserStates.COMMAND;
    }
    else {
        this.state++;
    }
};

StompFrameEmitter.prototype.handleData = function(data) {
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
        if (this.state == ParserStates.ERROR) {
            this.parseError();
        }
    } while (this.state == ParserStates.COMMAND && this.hasLine());
};

StompFrameEmitter.prototype.hasLine = function() {
    return (this.buffer.indexOf('\n') > -1);
};

StompFrameEmitter.prototype.popLine = function () {
    var index = this.buffer.indexOf('\n');
    var line = this.buffer.slice(0, index);
    this.buffer = this.buffer.substr(index + 1);
    return line;
};

StompFrameEmitter.prototype.error = function (err) {
    this.emit('error', err);
    this.state = ParserStates.ERROR;
};

StompFrameEmitter.prototype.parseCommand = function() {
    while (this.hasLine()) {
        var line = this.popLine();
        if (line != '') {
            if (StompClientCommands.indexOf(line) == -1) {
                this.error({
                    message: 'No such command',
                    details: 'Unrecognized Command \'' + line + '\'',
                });
                break;
            }
            this.request.setCommand(line);
            this.incrementState();
            break;
        }
    }
};

StompFrameEmitter.prototype.parseHeaders = function() {
    while (this.hasLine()) {
        var line = this.popLine();
        if (line == '') {
            this.incrementState();
            break;
        }
        else {
            var kv = line.split(':', 2);
            if (kv.length != 2) {
                this.error({
                    message: 'Error parsing header',
                    details: 'No ":" in line "' + line + '"',
                });
                break;
            }
            this.request.setHeader(kv[0], kv[1]);
        }
    }
};

StompFrameEmitter.prototype.parseBody = function() {
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
        // The end of the request has been identified, finish creating it
        this.request.appendToBody(this.buffer.slice(0, index));
        // Emit the request and reset
        this.emit('request', this.request);
        this.request = new Request();
        this.incrementState();
        this.buffer = this.buffer.substr(index + 1);
    }
};

StompFrameEmitter.prototype.parseError = function () {
    var index = this.buffer.indexOf('\0');
    if (index > -1) {
        this.buffer = this.buffer.substr(index + 1);
        this.incrementState();
    }
    else {
        this.buffer = "";
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

Request.prototype.send = function(stream) {
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

function StompServer(port) {
    this.port = port;
    this.server = net.createServer(function(stream) {
        stream.on('connect', function() {
            console.log('Received Unsecured Connection');
            new StompStreamHandler(stream);
        });
    });
}

function SecureStompServer(port, credentials) {
    StompServer.call(this);
    this.port = port;
    this.server = net.createServer(function (stream) {
        stream.on('connect', function () {
            console.log('Received Connection, securing');
            stream.setSecure(credentials);
        });
        stream.on('secure', function () {
            new StompStreamHandler(stream);
        });
    });
}

sys.inherits(SecureStompServer, StompServer);

StompServer.prototype.listen = function() {
    this.server.listen(this.port, 'localhost');
};

StompServer.prototype.stop = function(port) {
    this.server.close();
};

new SecureStompServer(8124, credentials).listen();
new StompServer(8125).listen();
