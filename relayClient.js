const http = require('http');

const WebSocket = require('ws');
const request = require('request');

const { RELAY_SERVER_IP, RELAY_SERVER_PORT, WEB_SERVER_PORT } = require('./config.json');
const { CMD, CMD_TYPE, RESULT } = require('./constants.js');
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
  else {
    processNormalRequest(data);
  }
}

function processFileDownloadRequest(data) {
  // console.log('\nIN processFileDownloadRequest: \n');

  const { url, fileName, uuid, cmd, cmdType } = data;
  const downloadUrl = `http://localhost:${ WEB_SERVER_PORT }${ url }`;
  const uploadUrl = `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/upload`;
  downloadThenUpload(downloadUrl, uploadUrl, ({code, body}) => {
    if (code === 200) {
      console.log('\nbody:');
      console.log(body);
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
  });
}

function processFileUploadRequest(data) {
  const { mainFolder, subFolder, fileNameList, uuid, cmd, cmdType } = data;  
  const downlaodUrlList = fileNameList.map( 
    fileName => `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/download/${mainFolder}/${subFolder}/${fileName}` 
    // fileName => `http://${ RELAY_SERVER_IP }:${ RELAY_SERVER_PORT }/relay/download/${mainFolder}` 
  );
  const uploadUrl = `http://localhost:${ WEB_SERVER_PORT }/upload`;
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

function processNormalRequest(data) {
  const options = {
    host: 'localhost',
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
      if (ws && ws.readyState == 1) {
        let replyData = {
          body: str,
          uuid: data.uuid,
          cmd : data.cmd
          // rawHeaders: res.rawHeaders,
          // statusCode: res.statusCode
        };
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

function downloadThenUpload(d_url, u_url, cb) {
  const _makeCallbackReplay = (code, body) => {
    return cb({code, body});
  };

  const downlaodList = (typeof d_url === 'string') ? [ d_url ] : d_url;
  const formData = {};

  // console.log('\n=======================================');
  // console.log('typeof d_url === ' + (typeof d_url));
  // console.log('downlaodList:', downlaodList);
  downlaodList.forEach( (downloadUrl, index) => {    
    // console.log(downloadUrl);
    let downloadReq = request
      .get( downloadUrl )
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
    formData : formData
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

function onWebsocetError(e) {
  console.log('Error: ' + e.message);
}

function genNewWebSocketInstance() {
  ws = new WebSocket(`ws://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`); 
  ws.on('open', d => console.log('[ws-client]: connected'));
  ws.on('message', onReceiveCloudMessage);
  ws.on('error', onWebsocetError);
  ws.on('close', onWebSocketClose );  
}

genNewWebSocketInstance();