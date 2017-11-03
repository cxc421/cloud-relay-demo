const DOWLOAD_URL = 'https://cdn.pixabay.com/photo/2017/03/14/17/43/mountain-2143877_960_720.jpg';
const UPLOAD_URL = 'http://localhost:8080/upload';

const request = require('request');
const fs = require('fs');
const path = require('path');



// var r = request
//   .get(DOWLOAD_URL)
//   .on('error', function(err) {
//     console.log(err)
//   })    
//   .on('response', function(response) {
//   	console.log('Download response:');
//     console.log(response.statusCode) // 200
//     console.log(response.headers['content-type']) // 'image/png'
//     if (response.statusCode === 200) {
// 			let up = request.post('http://localhost:8080/upload', function (err, resp, body) {
// 				console.log('Upload response:');
// 			  if (err) {
// 			    console.log('Error!');
// 			  } else {
// 			  	console.log(resp.statusCode);
// 			    console.log(body);
// 			  }
// 			});
// 			r.pipe(up);
//     }
//   });		


var downloadReq = request
  .get(DOWLOAD_URL)
  .on('error', function(err) {
    console.log(err)
  })    
  .on('response', function(response) {
  	console.log('Download response:');
    console.log(response.statusCode) // 200
    console.log(response.headers['content-type']) // 'image/png'
    if (response.statusCode !== 200) {	    	
    	// downloadReq.abort();
    	upReq.abort();
    	console.log('Abort');
    }
  });	


var formData = {
  method   : 'POST',
  url      : UPLOAD_URL,  
  formData : { file : downloadReq }
};

var upReq = request(formData, function(err, res, body){
  if (err) throw err;
  console.log("successful");
});






