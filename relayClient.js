const http = require('http');

const WebSocket = require('ws');
const request = require('request');
const normalizeHeaderCase = require("header-case-normalizer");

const { RELAY_SERVER_IP, RELAY_SERVER_PORT, WEB_SERVER_PORT, WEB_SERVER_IP } = require('./config.json');
const { CMD, CMD_TYPE, RESULT, WS_PROTOCOL } = require('./constants.js');
let ws = null;

function onReceiveCloudMessage(dataJson) {
  const data = JSON.parse(dataJson);

  console.log('\nonReceiveCloudMessage:');
  console.log(data);

  if (data.cmd === CMD.FILE_REQUEST) {
    switch (data.cmdType) {
      case CMD_TYPE.FILE_DOWNLOAD:
        processFileDownloadRequest(data);
      break;
      case CMD_TYPE.FILE_UPLOAD:
        processFileUploadRequest(data);
      break;      
      default:
        throw new Error('Undefined data.cmdType = ' + data.cmdType);
    }    
  }
  else if (data.cmd === CMD.WEBSOCKET_REQUEST) {
    processWebSocketRequest(data);
  }
  else {
    processNormalRequest(data);
  }
}

function processWebSocketRequest(data) {
  const { wsProtocol, uuid }  = data;
  let wsWeb = null, wsP2p = null;
  // wsWeb = createWebSocket({
  //   wsProtocol: wsProtocol,
  //   wsUrl     : 
  // });

  // Create New WebSocket to NVR
  wsWeb = new WebSocket(`ws://${WEB_SERVER_IP}:${WEB_SERVER_PORT}`, wsProtocol);  
  wsWeb.on('open', () => console.log('[ws-client]: New connection to NVR.'));
  wsWeb.on('error', onWebsocetError);
  wsWeb.on('message', onWebSocketMessage);
  wsWeb.on('close', onWebSocketClose__WEB_P2P);

  wsP2p = new WebSocket(`ws://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`, [WS_PROTOCOL.P2P, uuid]);  
  wsP2p.on('open', () => console.log('[ws-client]: New connection to CLOUD.'));
  wsP2p.on('error', onWebsocetError);
  wsP2p.on('message', onWebSocketMessage);
  wsP2p.on('close', onWebSocketClose__WEB_P2P);

  wsWeb['__nextWs'] = wsP2p;
  wsWeb['__cachedMsgList'] = [];

  wsP2p['__nextWs'] = wsWeb;
  wsP2p['__cachedMsgList'] = [];
}

function processFileDownloadRequest(data) {
  // console.log('\nIN processFileDownloadRequest: \n');

  const { url, fileName, uuid, cmd, cmdType, cookie } = data;
  const downloadUrl = `http://${ WEB_SERVER_IP }:${ WEB_SERVER_PORT }${ url }`;
  const uploadUrl = `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/upload`;  
  downloadThenUpload(downloadUrl, uploadUrl, ({code, body}) => {
    if (code === 200) {
      // console.log('\nbody:');
      // console.log(body);
      try {
        const bodyData = JSON.parse(body);
        ws.send(JSON.stringify({        
          result   : RESULT.OK,
          cmd      : cmd,
          cmdType  : cmdType,
          uuid     : uuid,
          fileName : fileName,
          url      : url,
          subFolder: bodyData.subFolder
        }));
      }
      catch(e) {
        console.error('\nWTF!!!??????????????');
        console.error(e.message);
        console.error('');
        ws.send(JSON.stringify({
          result  : RESULT.FAILED,
          cmd     : cmd,
          cmdType : cmdType,
          uuid    : uuid,
          fileName: fileName,
          url     : url
        }));        
      }
    }
    else {
      ws.send(JSON.stringify({
        result  : RESULT.FAILED,
        cmd     : cmd,
        cmdType : cmdType,
        uuid    : uuid,
        fileName: fileName,
        url     : url
      }));
    }
  }, cookie);
}

function processFileUploadRequest(data) {
  const { mainFolder, subFolder, fileNameList, uuid, cmd, cmdType } = data;  
  const downlaodUrlList = fileNameList.map( 
    fileName => `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/download/${mainFolder}/${subFolder}/${fileName}` 
    // fileName => `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/download/${mainFolder}` 
  );
  const uploadUrl = `http://${ WEB_SERVER_IP }:${ WEB_SERVER_PORT }/upload`;
  // console.log('========================');
  // console.log('fileNameList:');
  // console.log(fileNameList);
  downloadThenUpload( downlaodUrlList, uploadUrl, ({code, body}) => {
    // To Do......  
    const replyData = {
      uuid      : uuid,
      cmd       : cmd,
      cmdType   : cmdType,
      subFolder : subFolder,
      body      : body,
      statusCode: code
    };

    ws.send(JSON.stringify(replyData));
  });
}

function processNormalRequest2(data) {
  const options = {
    host: WEB_SERVER_IP,
    port: WEB_SERVER_PORT,
    path: data.url,
    method: data.method,
    headers: data.headers 
  };  

  const forwardreq = http.request(options, function(res){
    // console.log('in request callback');
    var str = '';

    res.on('data', function(chunk){
      str += chunk;
    });

    res.on('end', function(){
      // console.log('str = ' + str);
      // console.log('typeof str = ' + typeof(str));
      if (res.statusCode === 302) {
      	console.log('=====================');
      	console.log(res.statusCode);
      	console.log(res.headers.location);
      	// console.log(  encodeURI(res.headers.location) );
      	// console.log(res.headers['cache-control']);      	
      }


      if (ws && ws.readyState == WebSocket.OPEN) {
        let replyData = {
          body      : str,
          uuid      : data.uuid,
          cmd       : data.cmd,
          setCookie : res.headers['set-cookie'],
          statusCode: res.statusCode,
          location  : res.headers.location 
          // rawHeaders: res.rawHeaders,
          // statusCode: res.statusCode
        };
        // console.log('AAAAAAAAAAAAAAAAAAAAAAAA');
        // console.log( encodeURI( JSON.stringify(replyData) ) );
        // console.log( '=============== SET-COOKIE ====================' );
        // console.log( res.headers['set-cookie'] );
        ws.send(JSON.stringify(replyData));
      }
      else {
        console.error('[request-callback]: Websocket Close!');
      }
    });
  });  
  if (data.method === "PUT" || data.method === "POST") {
    forwardreq.write(data.body); 
  }
  forwardreq.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);    
  });  
  forwardreq.end(); 
}

function processNormalRequest(data) {
	const transfomrHeader = (obj) => {
		for (let prop in obj) {
			let val = obj[prop];
			delete obj[prop];
			obj[ normalizeHeaderCase(prop) ] = val;
		}
		return obj;
	};

  var options = {
    method: data.method,    
    url: `http://${WEB_SERVER_IP}:${WEB_SERVER_PORT}${data.url}`,
    headers: transfomrHeader(data.headers),    
    // headers: data.headers,    
    body: data.body,
    encoding : "utf8"
  };	
  if (data.url === '/login') {
	  options["headers"] = {
	  	"Content-Type": "application/json",
	  };
	  // options.headers['Content-Type'] = 'application/json';	  
	  options.json = true;	  
	  options.body = JSON.parse(options.body);
	  
	  console.log('\n**************************************');
	  console.log(options);


	  // const headers = options.headers;
	  // delete headers['Cookie'];
	  // delete headers['Referer'];
	  // delete headers['Accept-Encoding'];
	  // delete headers['Accept-Language'];
	  // delete headers['User-Agent'];

	  // delete headers['Content-Length'];
	  // delete headers['content-length'];
  }


  request(options, function(err, res, body) {
  	if (err) {
  		console.log('ERROR QQ');
  		console.log(err.message);
  		console.log('\n Before Send:');
  		console.log(options);
  	}
  	else {
      if (ws && ws.readyState == WebSocket.OPEN) {
        let replyData = {
          body      : body,
          uuid      : data.uuid,
          cmd       : data.cmd,
          setCookie : res.headers['set-cookie'],
          statusCode: res.statusCode,
          location  : res.headers['location']
          // rawHeaders: res.rawHeaders,
          // statusCode: res.statusCode
        };        
        ws.send(JSON.stringify(replyData));
      }
      else {
        console.error('[request-callback]: Websocket Close!');
      }  		
  	}
	});  
}

function downloadThenUpload(d_url, u_url, cb, cookies) {
  const _makeCallbackReplay = (code, body) => {
    return cb({code, body});
  };

  const downlaodList = (typeof d_url === 'string') ? [ d_url ] : d_url;
  const formData = {};

  // console.log('\n=======================================');
  // console.log('typeof d_url === ' + (typeof d_url));
  // console.log('======== TEST =============');
  // console.log(cookies);

  // console.log('downlaodList:', downlaodList);
  downlaodList.forEach( (downloadUrl, index) => {    
    const downloadOptions = {
      method: 'GET',
      url   : downloadUrl,
      headers: {
        'Cookie' : cookies
      }
    };

    // console.log(downloadUrl);
    // let downloadReq = request
    //   .get( downloadUrl )
    let downloadReq = request(downloadOptions)
      .on('error', (err) => {
        console.log(err.message);  
        return _makeCallbackReplay(500, JSON.stringify({
          code: -1,
          msg : 'Upload failed'
        }));                          
      })
      .on('response', (response) => {        
        if (response.statusCode !== 200) {        
          uploadReq.abort();
          return _makeCallbackReplay(500, JSON.stringify({
            code: -2,
            msg : 'Upload failed'
          }));
        }
      });
    formData['file_' + index] = downloadReq;
  });

  var uploadOptions = {
    method   : 'POST',
    url      : u_url,  
    formData : formData,
    headers  : {
      'Cookie' : cookies
    }
  };

  var uploadReq = request(uploadOptions, function(err, res, body){
    //if (err) throw err;
    const statusCode = (res) ? res.statusCode : 500;
    if (err) {
      console.log(err.message);
      _makeCallbackReplay(statusCode, JSON.stringify({
        code: -3,
        msg: 'Upload failed'
      }));
    }
    else {
      _makeCallbackReplay(statusCode, body);
    }    
  });    
}

function onWebSocketClose(data) {
  console.log('[ws-client]: disconnected!, retry after 1sec....');
  ws = null;
  setTimeout(genNewWebSocketInstance, 1000);
}

function onWebSocketClose__WEB_P2P() {
  if (this.__nextWs && this.__nextWs.readyState === WebSocket.OPEN) {
    this.__nextWs.terminate();
  }
  this.__nextWs = null;
  this.__cachedMsgList = null;
  // console.log('[onWebSocketClose__WEB_P2P]: Close!');
}

function onWebSocketMessage(newMsg) {
  if (this.__nextWs && this.__nextWs.readyState === WebSocket.OPEN) {
    // Ensure pre cachedMsg all send
    while( this.__cachedMsgList.length > 0 ) {
      const cachedMsg = this.__cachedMsgList.shift();
      this.__nextWs.send( cachedMsg );
    }
    // Send new msg
    this.__nextWs.send( newMsg );
  }
  else {
    // Cached msg
    this.__cachedMsgList.push( newMsg );
  }
}

function onWebsocetError(e) {
  console.log('Error: ' + e.message);
}

function genNewWebSocketInstance() {
  ws = new WebSocket(`ws://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`, WS_PROTOCOL.HTTP); 
  ws.on('open', d => console.log('[ws-client]: connected'));
  ws.on('message', onReceiveCloudMessage);
  ws.on('error', onWebsocetError);
  ws.on('close', onWebSocketClose );  
}

genNewWebSocketInstance();