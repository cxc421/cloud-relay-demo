const { RELAY_SERVER_IP, RELAY_SERVER_PORT, WEB_SERVER_PORT } = require('./config.json');
// var socket = require('socket.io-client')('http://localhost:8080');
var socket = require('socket.io-client')(`http://${RELAY_SERVER_IP}:${RELAY_SERVER_PORT}`);
var http = require('http');


socket.on('connect', function(){
    console.log('connected');
});
    
socket.on('disconnect', function(){
    console.log('disconnect');
});

socket.on('req', function(req){
    console.log('\n-----------------------------------------------');    
    console.log('method: ' + req.method);
    console.log('url: ' + req.url);
    console.log('httpversion: ' + req.httpVersion);       

    //http request start
    var options = {
      host: 'localhost',
      port: WEB_SERVER_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers 
    };    

    var forwardreq = http.request(options, function(res){
        console.log('in request callback');
        var str = '';

        res.on('data', function(chunk){
            str += chunk;
        });

        res.on('end', function(){
            // console.log('str = ' + str);
            // console.log('typeof str = ' + typeof(str));

            socket.emit('res', {
                result: str,
                id    : req.id,
                rawHeaders: res.rawHeaders,
                statusCode: res.statusCode
            });
        });
    });
    
    if (req.method == "PUT" || req.method == "POST") {
        forwardreq.write(req.body); 
    }

    forwardreq.on('error', (e) => {
      console.error(`problem with request: ${e.message}`);
      // console.error(options);
    });
    
    forwardreq.end();
    //http request end
})
