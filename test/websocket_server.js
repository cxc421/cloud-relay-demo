const express = require('express');
const http = require('http');
const url = require('url');
const path = require('path');
const WebSocket = require('ws');
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, "public");
const app = express();

//public static files
app.use(express.static( PUBLIC_FOLDER_PATH )); 
app.use( onRequestNotFound );

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, handleProtocols });

wss.on('connection', function connection(ws, req) {

	console.log('New Connections');

  const location = url.parse(req.url, true);
  // You might use location.query.access_token to authenticate or share sessions
  // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
  console.log('\ntypeof ws.protocol:');  
  console.log(typeof ws.protocol);  
  console.log('ws.protocol:');  
  console.log(ws.protocol);
  console.log('ws.protocol === "" ? ' + (ws.protocol === "")  );  

  ws.on('message', function incoming(message) {
    console.log('\nreceived: %s', message);
  });

  ws.on('headers', function(headers, response) {
  	console.log('\nonHeaders:');
  	console.log(headers);
  });

  ws.send('Msg from server ------ 88779911');
});

server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
});

function handleProtocols(protocols, req) {
	console.log('\nhandleProtocols:');
	console.log(protocols);	
	return protocols[0];
}

function onRequestNotFound(req, res) {
	res.status(404).send('404 files not found.');
}