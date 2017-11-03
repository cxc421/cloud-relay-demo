const { RELAY_SERVER_PORT } = require('./config.json');
const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

server.listen(RELAY_SERVER_PORT);
const idtores = {};

app.use('/', function (req, res) {
    console.log('\n-----------------------------------------------');
    console.log('method: ' + req.method);
    console.log('url: ' + req.url);
    console.log('httpversion: ' + req.httpVersion);
    //console.log('header: '+ JSON.stringify(req.headers));    
    
    var now = JSON.stringify(new Date());
    req.id = now + "&" + Math.random();
    // 保存res，为了之后收到请求后拿出来
    idtores[req.id] = res;
    console.log('req.id = ' + req.id);

    var new_req = {
        httpVersion: req.httpVersion,
        headers:req.headers,
        trailers: req.trailers,
        method: req.method,
        url: req.url,
        id: req.id        
    };
    
    let body = '';
    if (req.method == 'POST' || req.method == 'PUT') {

        req.on('data', function(data){
            body += data;
        });

        req.on('end', function(){
            new_req.body = body;
            io.emit('req', new_req);
            // console.log('end of put or post, forward data: ' + body);
            // res.end('OK!');
        });
    } else {
        io.emit('req', new_req);        
    }

});

io.on('connection', function (socket) {
    console.log('new connecton');
    // socket.on('testevent', function (data) {
    //     console.log(data);
    // });
        
    socket.on('res', function (data){
        console.log('=> receive res from nat! res.id = ' + data.id);        
        var res = idtores[data.id];
        
        let headerObj = {};
        const rawHeaders = data.rawHeaders;
        for (let i=0; i<rawHeaders.length; i+=2) {
            let prop = rawHeaders[i];
            let val = rawHeaders[i+1];
            headerObj[prop] = val;
        }
        res.writeHead(data.statusCode, headerObj);

        res.write(data.result);
        // res.headers = data.headers;                        
        console.log(data);        
        console.log('headers to leave:' + res.headers);
        res.end();
        delete idtores[data.id];
    });
});

io.on('disconnection', function (socket) {
    console.log('disconnect');
});

console.log('listening, port = ' + RELAY_SERVER_PORT);
