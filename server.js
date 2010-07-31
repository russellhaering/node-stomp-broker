var net = require('net');
var fs = require('fs');
var sys = require('sys');
var crypto = require('crypto');
var StompFrame = require('./frame').StompFrame;
var StompFrameEmitter = require('./parser').StompFrameEmitter;

var privateKey = fs.readFileSync('CA/newkeyopen.pem', 'ascii');
var certificate = fs.readFileSync('CA/newcert.pem', 'ascii');
var certificateAuthority = fs.readFileSync('CA/demoCA/private/cakey.pem', 'ascii');
var credentials = crypto.createCredentials({
    key: privateKey,
    cert: certificate,
    ca: certificateAuthority,
});

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
    var frameEmitter = new StompFrameEmitter(StompClientCommands);

    stream.on('data', function (data) {
        frameEmitter.handleData(data);
    });

    stream.on('end', function () {
        stream.end();
    });

    frameEmitter.on('frame', function(frame) {
        console.log('Received Frame: ' + frame);
        if (frame.command == 'CONNECT') {
            new StompFrame({
                command: 'CONNECTED',
                headers: {
                    session: '0',
                }
            }).send(stream);
        }
    });

    frameEmitter.on('error', function(err) {
        var response = new StompFrame();
        response.setCommand('ERROR');
        response.setHeader('message', err['message']);
        if ('details' in err) {
            response.appendToBody(err['details']);
        }
        response.send(stream);
    });
};

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
