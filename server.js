var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var morgan     = require('morgan');
var mongoose   = require('mongoose');
var config 	   = require('./config');
var path 	   = require('path');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
	next();
});

//mongoose.connect('mongodb://localhost/wishlist');
mongoose.connect('mongodb://heroku_4xp4d89r:kvbabpm03dvf7jrtg28b0be3i6@ds161539.mlab.com:61539/heroku_4xp4d89r');

var apiRoutesPublic = require('./api/routes/api_public')(app, express);
app.use('/api', apiRoutesPublic);

app.get('*', function(req, res) {
	res.sendFile(path.join(__dirname + '/views/index.html'));
});


app.listen(config.port);
console.log('Сервер запущен');