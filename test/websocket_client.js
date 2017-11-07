  const RELAY_SERVER_IP = '127.0.0.1';
  const RELAY_SERVER_PORT = '8080';
  const WS_PROTOCOL = 'WS-CLOUD';
  const WS_PROTOCOL_2 = 'WS-CLOUD-2';
  const WebSocket = require('ws');

  const ws = new WebSocket(`ws://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`); 
  ws.on('open', d => console.log('\n[ws-client]: Connected'));
  ws.on('message', onReceiveCloudMessage);
  ws.on('error', onWebsocetError);
  ws.on('close', onWebSocketClose );  

  function onReceiveCloudMessage(msg) {
  	console.log('\n[ws-client] Receive msg:');
  	console.log(msg);
  }

  function onWebsocetError(err) {
  	console.error('\n[ws-client] Error: ' + err.message);
  }

  function onWebSocketClose() {
  	console.log('\n[ws-client] Close!');
  }