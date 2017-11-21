  const RELAY_SERVER_IP = '127.0.0.1';
  const RELAY_SERVER_PORT = '8080';
  const WEB_SERVER_IP = '127.0.0.1';
  const WEB_SERVER_PORT = '7070';
  
  const WS_PROTOCOL = 'WS-CLOUD';
  const WS_PROTOCOL_2 = 'WS-CLOUD-2';
  const WebSocket = require('ws');
  const request = require('request');

  const ws = new WebSocket(`ws://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`); 
  ws.on('open', d => console.log('\n[ws-client]: Connected'));
  ws.on('message', onReceiveCloudMessage);
  ws.on('error', onWebsocetError);
  ws.on('close', onWebSocketClose );  

function onReceiveCloudMessage(msg) {
	console.log('\n[ws-client] Receive msg:');  	
  console.log('==================================================');
  try {
    var data = JSON.parse(msg);
    console.log(data);
    makeRequest(data);
  }
  catch(e) {
    console.error('NOT JSON!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error(msg);
  }
}

function onWebsocetError(err) {
	console.error('\n[ws-client] Error: ' + err.message);
}

function onWebSocketClose() {
	console.log('\n[ws-client] Close!');
}

function makeRequest({ url, method, headers }) {
  const options = {
    method: method,
    url: `http://${WEB_SERVER_IP}:${WEB_SERVER_PORT}${ url }`,
    headers: headers,
    encoding: null
  };

  request(options, (err, res, body) => {
    if (err) {
      console.error('\n' + err.message);
    }
    else {      
      console.log('\nstatusCode:' + res.statusCode);      
      console.log('headers:');
      console.log(res.headers);
      console.log('typeof body: ' + (typeof body));
      console.log('body length: ' + body.length);
      // console.log(body);
      
      // console.log('typeof dataString: ' + (typeof dataString));

      if (ws && ws.readyState === WebSocket.OPEN) {
        let backString = JSON.stringify({
          statusCode: res.statusCode,
          headers   : res.headers          
        });
        console.log(backString.length);
        ws.send(backString);     
        ws.send(body);
      }
    }
  });
}




