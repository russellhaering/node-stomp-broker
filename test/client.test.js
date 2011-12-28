var sys = require('sys'),
    Events = require('events').EventEmitter,
    nodeunit  = require('nodeunit'),
    testCase  = require('nodeunit').testCase;

var StompClient = require('../lib/client').StompClient;

//mockage
var net = require('net');

net.createConnection = function() {
  return connectionObserver;
};

var StompFrame = require('../lib/frame').StompFrame;

// Override StompFrame send function to allow inspection of frame data inside a test
StompFrame.prototype.send = function(stream) {
  sendHook(this);
};

var sendHook = function() {};

// Mock net object so we never try to send any real data
var connectionObserver = new Events();

connectionObserver.write = function(data) {
    //Supress writes
};

module.exports = testCase({

  setUp: function(callback) {
    this.stompClient = new StompClient('127.0.0.1', 2098, 'user', 'pass', '1.0');
    callback();
  },
  
  tearDown: function(callback) {
    delete this.stompClient;
    connectionObserver = new Events();
    sendHook = function() {};
    callback();
  },

  'check default properties are correctly set on a basic StompClient': function(test) {
    var stompClient = new StompClient();

    test.equal(stompClient.user, '');
    test.equal(stompClient.pass, '');
    test.equal(stompClient.address, '127.0.0.1');
    test.equal(stompClient.port, 2098);
    test.equal(stompClient.version, '1.0');

    test.done();
  },

  'check CONNECT StompFrame is correctly formed': function(test) {
    sendHook = function(stompFrame) {
      test.equal(stompFrame.command, 'CONNECT');
      test.deepEqual(stompFrame.headers, {
          login: 'user',
          passcode: 'pass'
      });
      test.equal(stompFrame.body, '');
      test.equal(stompFrame.contentLength, -1);

      test.done();
    };

    //start the test
    this.stompClient.connect();
    connectionObserver.emit('connect');
  },

  'check inbound CONNECTED frame parses correctly': function(test) {
    var self = this;
    var testId = '1234';
    sendHook = function() {
      self.stompClient.stream.emit('data', 'CONNECTED\nsession:' + testId + '\n\n\0');
    };

    this.stompClient._stompFrameEmitter.on('CONNECTED', function (stompFrame) {
      test.equal(stompFrame.command, 'CONNECTED');
      test.equal(testId, stompFrame.headers.session);
      test.done();
    });

    //start the test
    this.stompClient.connect();
    connectionObserver.emit('connect');
  },

  'check SUBSCRIBE StompFrame is correctly formed': function(test) {
    var self = this;
    var testId = '1234';
    var destination = '/queue/someQueue';
    
    //mock that we recieved a CONNECTED from the stomp server in our send hook
    sendHook = function(stompFrame) {
      self.stompClient.stream.emit('data', 'CONNECTED\nsession:' + testId + '\n\n\0');
    };

    this.stompClient._stompFrameEmitter.on('CONNECTED', function (stompFrame) {
      //override the sendHook so we can test the latest stompframe to be sent
      sendHook = function(stompFrame) {
        test.equal(stompFrame.command, 'SUBSCRIBE');
        test.equal(stompFrame.headers.destination, destination);
        test.done();
      };

      self.stompClient.subscribe(destination, function(){
        // this callback never gets called unless the client recieves some data down the subscription
      });
    });

    this.stompClient.connect();
    connectionObserver.emit('connect');
  }


});