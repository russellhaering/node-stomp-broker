var SERVER_ADDRESS = '127.0.0.1';
var SERVER_PORT = 61613;
var QUEUE = 'thing';

var stompServer = require('../lib/server').createStompServer(SERVER_PORT).listen();
var StompClient = require('../lib/client').StompClient;

var stompClient = new StompClient(SERVER_ADDRESS, SERVER_PORT, '', '', '1.0');

stompClient.connect(function() {
  stompClient.subscribe(QUEUE, function(data){
    console.log('GOT A MESSAGE', data);
  });

  setTimeout(function(){
    stompClient.publish(QUEUE, 'oh herrow!');
  }, 1000);
  setTimeout(function(){
    stompClient.publish(QUEUE, 'wonely...');
  }, 2000);
  setTimeout(function(){
    stompClient.publish(QUEUE, 'so wonely...');
  }, 3000);
  setTimeout(function(){
    stompClient.publish(QUEUE, 'so wonely, so wonely and bwue!');
  }, 4000);
  setTimeout(function(){
    stompClient.disconnect(function() {
      console.log('DISCONNECTED');
    });
  }, 5000);
});
