var net = require('net');
var sys = require('sys');
var events = require('events');
var StompFrame = require('./frame').StompFrame;
var StompFrameEmitter = require('./parser').StompFrameEmitter;

var log = console.log;

// Inbound frame validators
var StompFrameCommands = {
  '1.0': {
    'CONNECTED': {
      'headers': { 'session': { required: true } }
    },
    'MESSAGE' : {
      'headers': {
        'destination': { required: true },
        'message-id': { required: true }
      }
    }
  }
};

function StompClient(address, port, user, pass, protocolVersion) {
  events.EventEmitter.call(this);
  this.user = (user || '');
  this.pass = (pass || '');
  this.address = (address || '127.0.0.1');
  //TODO Check what the default stomp port is
  this.port = (port || 2098);
  this.version = (protocolVersion || '1.0');
  this.subscriptions = {};
  this._stompFrameEmitter = new StompFrameEmitter(StompFrameCommands[this.version]);
  return this;
}

sys.inherits(StompClient, events.EventEmitter);

StompClient.prototype.connect = function(connectedCallback) {
  var self = this;
  self.stream = net.createConnection(self.port, self.address);
  self.stream.on('connect', function() {
    self.onConnect();
  });

  self.on('connect', function(sessionId) {
    connectedCallback(sessionId);
  });
};

StompClient.prototype.onConnect = function() {

  var self = this;

  // First set up the frame parser
  var frameEmitter = self._stompFrameEmitter;

  self.stream.on('data', function(data) {
    frameEmitter.handleData(data);
  });

  self.stream.on('end', function() {
    self.stream.end();
    self.emit('disconnect');
  });

  frameEmitter.on('MESSAGE', function(frame) {
      self.subscriptions[frame.headers.destination].map(function(callback) {
        callback(frame.body, frame.headers);
      });
  });

  frameEmitter.on('CONNECTED', function(frame) {
    self.emit('connect', frame.headers.session);
  });

  frameEmitter.on('ERROR', function(frame) {
    //TODO error handling...???
    log('Error handling for error messages...');
  });

  frameEmitter.on('parseError', function(err) {
    var msg = 'Error Parsing Message: ' + err['message'];
    if (err.hasOwnProperty('details')) {
      msg += ' (' + err['details'] + ')';
    }
    log(msg);
  });

  // Send the CONNECT frame
  var frame = new StompFrame({
    command: 'CONNECT',
    headers: {
      'login': self.user,
      'passcode': self.pass
    }
  }).send(self.stream);
};

StompClient.prototype.subscribe = function(queue, callback) {
  if (!(queue in this.subscriptions)) {
    this.subscriptions[queue] = [];
    new StompFrame({
      command: 'SUBSCRIBE',
      headers: {
        destination: queue
      }
    }).send(this.stream);
  }
  this.subscriptions[queue].push(callback);
};

StompClient.prototype.unsubscribe = function(queue, callback) {
  new StompFrame({
    command: 'UNSUBSCRIBE',
    headers: {
      destination: queue
    }
  }).send(this.stream);
  delete this.subscriptions[queue];
};

StompClient.prototype.publish = function(queue, message) {
  new StompFrame({
    command: 'SEND',
    headers: {
      destination: queue
    },
    body: message
  }).send(this.stream);
};

function SecureStompClient(address, port, user, pass, credentials) {
  events.EventEmitter.call(this);
  var self = this;
  self.user = user;
  self.pass = pass;
  self.subscriptions = {};
  self.stream = net.createConnection(port, address);
  self.stream.on('connect', function() {
    self.stream.setSecure(credentials);
  });
  self.stream.on('secure', function() {
    self.onConnect();
  });
}

sys.inherits(SecureStompClient, StompClient);

exports.StompClient = StompClient;
exports.SecureStompClient = SecureStompClient;