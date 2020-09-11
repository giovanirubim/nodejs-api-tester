const fs = require('fs');
const http = require('http');
const mysql = require('mysql');
const parseURL = require('url').parse;
const parseJson = require('./parse-json');
const request = require('./request');

const splitQuery = (src) => {
	const regex = /(("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|--[^\n]*|[^;])*)/g;
	return [...src.matchAll(regex)].map(m => m[1]||'').filter(s => s.trim());
};

const getConfig = () => parseJson(
	fs.readFileSync('./config.json').toString('utf8')
);

const [ a, b, script ] = process.argv;

const getMime = path => {
	let ext = path.substr(path.lastIndexOf('.') + 1).toLowerCase();
	return {
		'css': 'text/css',
		'html': 'text/html',
		'js': 'application/javascript',
	}[ext];
};
const port = getConfig().port || 80;

const concat = (a, b) => a.replace(/\/$/,'')+'/'+b.replace(/^\//,'');

let lastId = 0;
const getStringBody = (req) => new Promise(done => {
	let body = '';
	req.on('data', chunk => body += chunk.toString('utf8'));
	req.on('end', () => done(body));
});

let conn;
const connect = () => {
	conn = mysql.createConnection(getConfig().db);
};
connect();
const resetConn = () => {
	conn.end(err => {
		if (err) {
			conn.destroy();
		}
		connect();
	});
}

const runQuery = (query) => new Promise((done, fail) => {
	conn.query(query, (err, result) => {
		if (err) {
			resetConn();
		}
		done({ err, result });
	});
});

const runQueries = async (req, res, queries) => {
	let val, errored;
	for (let i=0; i<queries.length; ++i) {
		const query = queries[i];
		const { err, result } = await runQuery(query);
		val = err || result;
		if (err) {
			errored = true;
			break;
		}
		console.log({ query, val });
	};
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ success: !errored, res: val }));
};

const webRoot = concat(__dirname.replace(/\\/g, '/'), './web');

let lastTime = new Date();
const app = http.createServer(async (req, res) => {

	let { pathname: path, query } = parseURL(req.url, true);
	const body = await getStringBody(req)
	// console.log({ path, query, body });

	if (req.method === 'GET') {
		if (path === '/config') {
			res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8'});
			res.end(JSON.stringify(getConfig()));
			return;
		}
		if (path === '/') path = '/index.html'
		let filePath;
		if (path === '/js/test-queue.js') {
			filePath = getConfig().script || script;
		} else {
			filePath = concat(webRoot, path);
		}
		if (!fs.existsSync(filePath)) {
			res.writeHead(404);
			res.end();
			return;
		}
		try {
			const file = fs.readFileSync(filePath);
			res.writeHead(200, { 'Content-Type': getMime(filePath) + '; charset=utf-8' });
			res.end(file);
		} catch(error) {
			res.writeHead(500);
			res.end();
		}
		return;
	}

	let now = new Date();
	let dif = now - lastTime;
	lastTime = now;

	if (req.method === 'POST' && path === '/test') {
		res.writeHead(400, {'Content-Type': 'application/json'});
		res.end(JSON.stringify({ success: true, body, query }));
		return;
	}

	if (req.method === 'POST' && path === '/sql') {
		runQueries(req, res, splitQuery(body));
		return;
	}

	if (req.method === 'POST' && path === '/load-script') {
		const path = body;
		if (!fs.existsSync(path)) {
			res.writeHead(404);
			res.end();
			return;
		}
		try {
			const content = fs.readFileSync(path);
			res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
			res.end(content);
		} catch(err) {
			console.error(err);
			res.writeHead(500);
			res.end();
		}
		return;
	}

	if (req.method === 'POST' && path === '/request') {

		let json = body;
		let id = ++ lastId;
		const config = JSON.parse(json);
		console.log(`Request (${ id })`, config);

		try {
			let obj;
			request(config)
				.then(obj => {
					console.log(`Response (${ id })`, obj);
					res.writeHead(200, {
						'Content-Type': 'application/json; charset=utf-8',
						'Access-Control-Allow-Origin': '*'
					});
					res.end(JSON.stringify(obj));
				})
				.catch(err => {
					res.writeHead(500);
					res.end();
					console.log('Error:', err);
				})
		} catch(err) {
			console.log(err);
			res.writeHead(500);
			res.end();
		}
		return;
	}

	res.writeHead(404);
	res.end();

});

console.log(`Starting app at port ${port}...`);
app.listen(port, () => {
	console.log('App started');
});