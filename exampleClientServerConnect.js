var SERVER_ADDRESS = '127.0.0.1';
var SERVER_PORT = 8125;

var stompServer = require('./lib/server').createStompServer(SERVER_PORT).listen();
var StompClient = require('./lib/client').StompClient;

var stompClient = new StompClient(SERVER_ADDRESS, SERVER_PORT, 'user', 'pass', '1.0');

stompClient.connect(function() {
  stompClient.subscribe('/queue/thing', function(data){
    console.log('GOT A MESSAGE', data);
  });

  setTimeout(function(){
    stompClient.publish('/queue/thing', 'herrow!');
  }, 1000);
});