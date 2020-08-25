const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const parseURL = require('url').parse;
const bridge = require('./bridge');
const parseJson = require('./parse-json');
const request = require('./request');

const routMap = {};
const getEndpoint = (method, path) => {
	path = path.replace(/\/$/, '');
	return method.trim().toUpperCase() + ' ' + path.trim();
};

const loadWebSrc = (path, req, res) => {
	path = path.replace(/\/$/, '');
	let root = __dirname.replace(/\\|([^\///]$)/g, '$1/');
	let pathname = `${root}../web${path}`;
	if (!fs.existsSync(pathname)) {
		res.writeHead(404);
		res.end();
		return;
	}
	if (fs.lstatSync(pathname).isDirectory()) {
		pathname += 'index.html';
		if (!fs.existsSync(pathname)) {
			
		}
	}
};

const app = http.createServer(async (req, res) => {
	let { method, url } = req;
	let { path } = parseURL(url);
	let handler = routMap[getEndpoint(method, path)];
	if (handler) {
		try {
			await handler(req, res);
		} catch(err) {
			console.error(err);
			res.writeHead(500);
			res.end();
		}
		return;
	}
	if (method.match(/get/i)) {
		loadWebSrc(path, req, res);
		return;
	}
	res.writeHead(404);
	res.end();
});

const addRout = (method, path, handler) => {
	routMap[getEndpoint(method, path)] = handler;
};

module.exports.start = (config) => {
	const port = config.port || 80;
	app.listen(port, () => {
		if (!process.env.env) {
			child_process.execSync('start http://localhost:' + port + '/');
		} else {
			console.log(new Date() + ': server started at port ' + port);
		}
	});
};