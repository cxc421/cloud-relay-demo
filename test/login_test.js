var querystring = require('querystring');
var request = require('request');
var crypto = require('crypto');

const IP = '192.168.6.191';
const PORT = 80;
const ACCOUNT = 'Admin';
const PSWD = '123qwe';

function login(ip, port, name, pwd, callback){
  var data_string = name + ":" + pwd;
  var encrypt = crypto.createHash('md5').update(data_string).digest("hex");
  var data = {
      account: encrypt
  };

  var options = {
    method: 'POST',
    url: "http://" + ip + ":" + port.toString() + "/login",
    headers: {
      'Content-Type': 'application/json',
    },
    json : true,
    body: data,
    encoding : "utf8"
  };

  console.log('options:');
  console.log(options);
  console.log('');

  request(options, (err,res, body) => {
	  if(err == null){
	  	if (callback) {
				callback(res.headers['set-cookie']);
	  	}	
	  	else {
	  		console.log('res.statusCode = ' + res.statusCode);
	  		console.log('body:');
	  		console.log(body);
	  		// console.log('');	  		
	  	}    
	  }
	  else{
	    console.log(err);
	  }
	});
};

login( IP, PORT, ACCOUNT, PSWD );
