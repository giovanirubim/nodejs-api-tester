{

let host = localStorage.host || 'http://localhost:8080';
let headers = {};
let token = localStorage.getItem('token');
let setToken = (val) => {
	if (val instanceof Object) {
		val = val.token_type + ' ' + val.access_token;
	}
	token = val;
	headers['Authorization'] = val;
	localStorage.setItem('token', val);
	$('#token').text(token);
};
let middleware = true;
const logs = [];

const concat = (a, b) => {
	return a.replace(/\/$/,'')+'/'+b.replace(/^\//,'');
};

let config = null;
const loadConfig = () => new Promise((done, fail) => {
	$.get({
		'url': '/config',
		success: res => {
			try {
				config = JSON.parse(res);
				let users = config.auth.users || {};
				for (let name in users) {
					auth_user_map[name] = users[name];
				}
				auth_user = config.auth.user || Object.values(users)[0];
				done(config);
			} catch(err) {
				fail(err);
			}
		},
		error: err => {
			fail(err);
		}
	});
});

const keyCmds = {};
addKeyCmd = (keyCmd, handler) => {
	let mainKey = null;
	let alt = 0;
	let ctrl = 0;
	let shift = 0;
	keyCmd.trim().split(/\s+/).forEach(key => {
		if (key === 'alt') {
			alt = 1;
		} else if (key === 'ctrl') {
			ctrl = 1;
		} else if (key === 'shift') {
			shift = 1;
		} else if (mainKey !== null) {
			throw 'Invalid key shortcut';
		} else {
			mainKey = key;
		}
	});
	const code = [mainKey, alt, ctrl, shift].join(' ');
	keyCmds[code] = handler;
};

const nameMap = {};
const tagMap = {};
const testMap = {};
const allTests = [];
const testQueue = [];
let current_test = null;

window.data = {};

class DataRequest {
	constructor(type, name) {
		this.type = type;
		this.name = name;
	}
	run() {
		return Data[this.type](this.name);
	}
}
const nested = /^\w+(\[\d+\]|\.\w+)+$/;
const ref = (obj, name, value) => {
	if (!nested.test(name)) {
		if (value == null) return obj[name];
		obj[name] = value;
		return;
	}
	let keys = '.' + name;
	const nextKey = () => {
		let key;
		if (keys[0] === '.') {
			key = keys.substr(1).replace(/(\[|\.).*$/, '');
			keys = keys.replace(/^\.\w+/, '');
		} else {
			key = keys.substr(1).replace(/\].*$/, '');
			keys = keys.replace(/^\[\d+\]/, '');
		}
		return key;
	};
	for (;;) {
		let key = nextKey();
		if (!keys) {
			if (value != null) {
				obj[key] = value;
				return;
			} else {
				return obj[key];
			}
		}
		obj = obj[key];
	}
};

const storeData = () => {
	localStorage.setItem('data', JSON.stringify(window.data));
};

const loadData = () => {
	let json = localStorage.getItem('data') || '{}';
	window.data = JSON.parse(json);
};

window.Data = {
	store: (a, b) => {
		if (a instanceof Object) {
			for (let attr in a) {
				window.data[attr] = a[attr];
			}
			storeData();
			return;
		}
		if (typeof a !== 'string') throw 'Invalid argument';
		ref(window.data, a, b);
		storeData();
	},
	load: (name) => {
		if (current_test) {
			if (name == null) {
				return window.data;
			}
			return ref(window.data, name);
		}
		return new DataRequest('load', name);
	},
	res: (attr) => {
		if (current_test) {
			if (attr == null) {
				return current_test.temp;
			}
			return ref(current_test.temp, attr);
		}
		return new DataRequest('res', attr);
	}
};

const addHeader = (a, b) => {
	if (a instanceof Object) {
		for (let attr in a) {
			addHeader(attr, a[attr]);
		}
		return;
	}
	headers[a] = b;
};

const runStep = async (test, step) => {
	if (!current_test) throw 'No current test';
	const {type} = step;
	if (type === 'head') {
		const { args } = step;
		addHeader(...args);
		return true;
	} else if (type === 'auth_user') {
		const { name } = step;
		const user = auth_user_map[name];
		if (!user) {
			throw `No auth user named ${ name }`;
		}
		auth_user = user;
		return true;
	} else if (type === 'check') {
		const {fn} = step;
		if (false === await fn()) {
			console.log(`didn't pass %c${fn.toString()}`, 'color:#ee2');
			return false;
		}
	} else if (type === 'request') {
		let { query } = step;
		if (query) {
			if (query instanceof Object) {
				let arr = []
				for (let attr in query) {
					const pair = [attr];
					const val = query[attr];
					if (val instanceof DataRequest) {
						pair.push(val.run());
					} else {
						pair.push(val);
					}
					arr.push(pair);
				}
				const f = encodeURIComponent;
				arr = arr.map(([a, b]) => `${f(a)}=${f(b)}`);
				query = arr.join('&');
			}
		}
		let { type, path, data } = step.config;
		if (data instanceof DataRequest) {
			data = data.run();
		}
		if (path.includes(':')) {
			let regexp = /(\/:[^\/]+)/g;
			let values = [];
			for (;;) {
				let res = regexp.exec(path);
				if (!res) break;
				let name = res[0].substr(2);
				values.push(Data.load(name));
			}
			let newPath = '';
			path.split(/\/:[^\/]+\/?/).forEach((str, i) => {
				if (i) newPath += `/${ values[i-1] }/`;
				newPath += str;
			});
			path = newPath;
		}
		if (query) {
			path += (path.includes('?')?'&':'?') + query;
		}
		let res;
		try {
			res = await hostRequest({ type, path, data });
		} catch(err) {
			console.log('Failed to make request');
			return false;
		}
		test.response = res;
		test.temp = res.response;
	} else if (type === 'store') {
		Data.store(step.name, test.temp);
	} else if (type === 'accept') {
		if (test.response.code != step.code) {
			console.log(`%cExpected status ${step.code} but got ${test.response.code}`, 'color:#ee2');
			return false;
		}
	} else if (type === 'call') {
		test.temp = await step.fn();
	} else if (type === 'needs') {
		let {tags} = step;
		for (let i=0; i<tags.length; ++i) {
			let tag = tags[i];
			let array = tagMap[tag] || [];
			for (let i=0; i<array.length; ++i) {
				const test = array[i];
				if (!test.executed) {
					let temp = current_test;
					current_test = null;
					let res = await runTest(test);
					current_test = temp;
					if (res === false) {
						return false;
					}
				}
			}
		}
	} else if (type === 'host') {
		localStorage.setItem('host', host = step.host);
		$('[name="host"]').val(step.host);
	} else if (type === 'sql') {
		let { query } = step;
		if (typeof query === 'function') {
			query = await query();
		}
		try {
			await runSql(query);
		} catch(err) {
			console.error('SQL error');
			return false;
		}
	}
	return true;
};

const newChecker = (args) => {
	args = args.replace(/(\w+)/gi, 'config.flags.$1');
	let res;
	eval(`res = ${args};`);
	return res;
};

const checkFlagsArg = (args) => {
	if (args.match(/[&\|!\(\)]|==|!=/)) {
		return newChecker(args);
	}
	if (typeof args === 'string') {
		if (args.includes(';')) {
			args = args.trim().split(/\s*;\s*/);
		} else {
			args = [args];
		}
	}
	for (let i=0; i<args.length; ++i) {
		let arg = args[i];
		let name, value;
		if (/\s*[:=]\s*/.test(arg)) {
			[name, value] = arg.split(/\s*[:=]\s*/);
			value = 'true t 1 yes'.split(' ').includes(value.toLowerCase());
		} else {
			name = arg;
			value = true;
		}
		if ((!!config.flags[name]) !== value) {
			return false;
		}
	}
	return true;
};

const checkIfStep = (step) => {
	return checkFlagsArg(step.arg);
};

class Test {
	constructor(flagsArg) {
		this.executed = false;
		this.succeed = null;
		this.steps = [];
		this.tags = [];
		this.hasTag = {};
		this.response = null;
		this.temp = null;
		this.isTask = false;
		this.flagsArg = flagsArg;
		this.stack = 0;
	}
	setHost(host) {
		this.steps.push({ type: 'host', host });
		return this;
	}
	head(...args) {
		this.steps.push({ type: 'head', args });
		return this;
	}
	authUser(name) {
		this.steps.push({ type: 'auth_user', name });
		return this;
	}
	check(fn) {
		this.steps.push({ type: 'check', fn });
		return this;
	}
	call(fn) {
		this.steps.push({ type: 'call', fn });
		return this;
	}
	tag(tag) {
		if (this.hasTag[tag]) {
			return this;
		}
		this.hasTag[tag] = true;
		this.tags.push(tag);
		(tagMap[tag] || (tagMap[tag] = [])).push(this);
		return this;
	}
	request(config) {
		this.steps.push({ type: 'request', config, query: null });
		return this;
	}
	query(obj) {
		const { steps } = this;
		let request = null;
		for (let i=steps.length; i--;) {
			const step = steps[i];
			if (step.type === 'request') {
				request = step;
				break;
			}
		}
		if (request === null) throw 'No previous request';
		request.query = obj;
		return this;
	}
	get(path, data) {
		return this.request({ type: 'GET', path, data });
	}
	post(path, data) {
		return this.request({ type: 'POST', path, data });
	}
	patch(path, data) {
		return this.request({ type: 'PATCH', path, data });
	}
	delete(path, data) {
		return this.request({ type: 'DELETE', path, data });
	}
	store(name) {
		this.steps.push({ type: 'store', name });
		return this;
	}
	accept(code) {
		this.steps.push({ type: 'accept', code });
		return this;
	}
	needs() {
		let tags = [];
		if (arguments.length === 0) throw 'Invalid arguments';
		if (arguments.length === 1) {
			let [ arg ] = arguments;
			if (arg instanceof Array) {
				tags = arg;
			} else {
				tags = [arg];
			}
		} else {
			tags.push(...arguments);
		}
		this.steps.push({ type: 'needs', tags });
		return this;
	}
	sql(query) {
		this.steps.push({ type: 'sql', query });
		return this;
	}
	flags(arg) {
		let stack = this.stack ++;
		this.steps.push({ type: 'if', arg, stack });
		return this;
	}
	end() {
		let stack = -- this.stack;
		this.steps.push({ type: 'endif', stack });
		return this;
	}
	async run() {
		const { steps } = this;
		const { length } = steps;
		for (let i=0; i<length; ++i) {
			let step = steps[i];
			if (step.type === 'endif') {
				continue;
			}
			if (step.type !== 'if') {
				if (!await runStep(this, steps[i])) {
					return false;
				}
				continue;
			}
			if (checkIfStep(step)) {
				continue;
			}
			let {stack} = step;
			while (i<length) {
				let step = steps[i];
				if (step.type === 'endif' && step.stack === stack) {
					break;
				}
				++ i;
			}
		}
		return true;
	}
}

const idMap = {};

window.addTest = (name, flagsArg) => {
	const test = new Test(flagsArg);
	let array = nameMap[name];
	if (!array) {
		run[name] = () => run(test);
		nameMap[name] = array = [];
	}
	let id = name;
	if (idMap[id]) {
		let temp = idMap[id];
		delete idMap[id];
		idMap[temp.id += ' (1)'] = temp;
		id += ' (2)';
	} else if (idMap[id + ' (1)']) {
		id += ` (${ array.length + 1})`;
	}
	idMap[id] = test;
	test.id = id;
	array.push(test);
	allTests.push(test);
	return test;
};

window.addTask = (...args) => {
	let task = addTest(...args);
	task.isTask = true;
	return task;
};

let auth_user;
let auth_user_map = {};

window.loadToken = () => new Promise((done, fail) => {
	$('.token button').attr('disabled', 'true');
	$.post({
		url: config.auth.token,
		data: { ...auth_user },
		success: (res) => {
			$('.token button').removeAttr('disabled');
			setToken(res);
			done();
		},
		error: (err) => {
			$('.token button').removeAttr('disabled');
			fail(err);
		}
	});
});

const makeRequest = ({ path, type, data }) => new Promise((done, fail) => {
	const url = concat(host, path);
	const config = {
		url,
		type,
		data: data != null && JSON.stringify(data),
		headers: {
			...headers,
			...(data? {'Content-Type': 'application/json'}: {})
		}
	};
	if (middleware) {
		$.post({
			url: '/request',
			data: JSON.stringify(config),
			success: done,
			error: fail
		});
	} else {
		$.ajax({
			...config,
			success: (a, b, res) => {
				done({
					statusCode: res.status,
					response: res.responseJSON || res.responseText,
					responseText: res.responseText
				});
			},
			error: (res) => {
				done({
					statusCode: res.status,
					response: res.responseJSON || res.responseText,
					responseText: res.responseText
				});
			},
		});
	}
});

const hostRequest = async ({ path, type, data }) => {
	if (!path.startsWith('/')) path = '/' + path;
	type = type.toUpperCase();
	const testId = current_test?.id;
	const log = {
		index: logs.length + 1,
		isHostReq: true,
		path,
		type,
		data: clone(data),
		testId
	};
	logs.push(log);
	showLog(log);
	let res;
	try {
		res = await makeRequest({ path, type, data });
		log.code = res.statusCode;
		log.res = res.response;
	} catch(err) {
		log.code = null;
		log.res = 'Request not completed';
	}
	showLog(log);
	if (!res) {
		throw 'Failed to make request';
	}
	return { code: log.code, parsed: log.res, response: res.response };
};

const trimQuery = (query) => {
	const lines = query.split('\n');
	let nTabs = Infinity;
	const res = [];
	lines.forEach(line => {
		if (!line.trim().length) return;
		let n = 0;
		while (line[n] === '\t') ++n;
		nTabs = Math.min(nTabs, n);
		res.push(('.'+line).trim().substr(1));
	});
	res.forEach((line, i) => res[i] = line.substr(nTabs));
	return res.join('\n');
};

const runSql = window.sql = async (query) => {
	const log = {
		index: logs.length + 1,
		isSqlQuery: true,
		query,
		testId: current_test?.id
	};
	logs.push(log);
	showLog(log);
	const res = await new Promise((done, fail) => $.post({
		url: '/sql',
		data: query,
		success: done
	}));
	log.res = res.res;
	showLog(log);
	if (!res.success) throw res.res;
	return res.res;
};

const runTest = async (test, index) => {
	if (current_test) throw 'There\'s an ongoing test';
	current_test = test;
	test.executed = true;
	let success;
	try {
		success = false !== await test.run();
	} catch(err) {
		console.error(err);
		success = false;
	}
	const tags = test.tags.map(tag => '#'+tag).join(' ');
	let styles = [];
	const addStyle = (obj) => {
		let str = '';
		for (let attr in obj) {
			str += attr + ': ' + obj[attr] + '; ';
		}
		styles.push(str.trim());
	};
	let message = '';
	message += (index != null? (index + 1) + '. ': '');
	let type = test.isTask? 'Task': 'Test';
	if (test.isTask) {
		message += '%c';
		addStyle({ 'font-style': 'italic' });
	}
	message += type + ' ' + test.id;
	if (tags) {
		message += ' %c' + tags;
		addStyle({
			color: '#666',
			'font-weight': 'bold'
		});
	}
	if (success) {
		if (!test.isTask) {
			addStyle({ color: '#0e2' });
			message += ' %cOk';
		}
	} else {
		addStyle({
			color: '#e22',
			'font-weight': 'bold'
		});
		message += ' %cFail';
	}
	console.log(message, ...styles);
	current_test = null;
	test.succeed = success;
	return success;
};

const reset = () => {
	console.clear();
	logs.length = 0;
	allTests.forEach(test => {
		test.executed = false;
		test.succeed = null;
	});
};

const resetTestQueue = (test) => {
	testQueue.length = 0;
	if (test) {
		testQueue.push(test);
		return;
	}
	allTests.forEach(test => {
		let {flagsArg} = test;
		if (!flagsArg || checkFlagsArg(flagsArg)) {
			testQueue.push(test);
		}
	});
};

const runQueue = async () => {
	let i = 0;
	for (let i=0; i<testQueue.length; ++i) {
		const test = testQueue[i];
		if (!await runTest(test, i)) return false;
	}
	return true;
};

const run = (test) => {
	resetTestQueue(test);
	return runQueue();
};

const start = () => {
	if (current_test) return;
	reset();
	run().then(success => success && console.log('%cSuccess', 'font-weight:bold;color:#7f0'));
};

run.now = () => {
	const test = new Test();
	setTimeout(() => {
		run(test);
	}, 0);
	return test;
};

const runOnce = async (id) => {
	const test = testMap[id];
	if (!test) throw `No test ${id}`;
	if (test.executed) {
		if (!test.succeed) throw 'Fail to complete required tests';
		return;
	}
	let temp = current_test;
	current_test = null;
	const res = await run(test);
	current_test = temp;
	if (!res) throw 'Fail to complete required tests';
};

const showLog = (log) => {
	const { index, testId } = log;
	$('#index').text(log.index);
	$('#length').text(logs.length);
	$('#testId').text(testId == null? '*': testId);
	if (log.isHostReq) {
		$('#logType').text('HTTP Request');
		$('.header .type').text(log.type).attr({ type: log.type });
		$('.header .path').text(log.path);
		$('[name="sent"]').val(log.data? JSON.stringify(log.data, null, '   '): '');
		if (log.code) {
			let text = log.code;
			if (log.res) {
				text += '\n\n' + JSON.stringify(log.res, null, '   ');
			}
			$('[name="text"]').val(text);
		} else {
			$('[name="text"]').val('...');
		}
	}
	if (log.isSqlQuery) {
		$('#logType').text('MySQL Query');
		$('.header .type').text('');
		$('.header .path').text('');
		$('[name="sent"]').val(trimQuery(log.query));
		const {res} = log;
		if (!res) {
			$('[name="text"]').val('...');
		} if (typeof res === 'string') {
			$('[name="text"]').val(res);
		} else {
			$('[name="text"]').val(JSON.stringify(res, null, '   '));
		}
	}
};

$(document).ready(async () => {

	loadData();

	const hostInput = $('[name="host"]');
	hostInput.val(host);
	hostInput.bind('keyup change', function(){
		host = this.value;
		localStorage.setItem('host', host);
	});

	$(window).bind('keydown', e => {
		if ($(e.target).is('textarea,input[type="text"]')) return;
		let key = e.key.toLowerCase().replace('arrow','');
		let alt = e.altKey|0;
		let ctrl = e.ctrlKey|0;
		let shift = e.shiftKey|0;
		let code = [key, alt, ctrl, shift].join(' ');
		const handler = keyCmds[code];
		if (handler) {
			e.preventDefault();
			e.stopPropagation();
			handler();
		}
	});

	$('.token button').bind('click', function() {
		if (!$(this).attr('disabled')) {
			loadToken();
		}
	});

	if (token) {
		setToken(token);
	}

	loadConfig()
		.then(() => {
			console.log('Script loaded: %c' + config.script, 'font-weight: bold; color: #ffa');
			let arr = [];
			for (let flag in config.flags) {
				if (config.flags[flag]) {
					arr.push(flag);
				}
			}
			console.log('Flags: %c' + arr.join('; '), 'font-weight: bold; color: #fff');
		})
		.catch(err => {
			console.error('Failed to load config', err);
		});

});

addKeyCmd('right', () => {
	let index = parseInt($('#index').text());
	let length = parseInt($('#length').text());
	if (index < length) {
		showLog(logs[index]);
	}
});

addKeyCmd('left', () => {
	let index = parseInt($('#index').text());
	let length = parseInt($('#length').text());
	if (index > 1) {
		showLog(logs[index - 2]);
	}
});

const showNextTest = (inc) => {
	let index = parseInt($('#index').text()) - 1;
	const first = logs[index];
	const { testId } = first;
	let log, prev;
	for (let i=index;;) {
		prev = log;
		log = logs[i += inc];
		if (!log || log.testId != testId) {
			break;
		}
	}
	log = log || prev;
	if (log) {
		showLog(log);
	}
};

addKeyCmd('ctrl left', () => {
	showNextTest(-1);
});

addKeyCmd('ctrl right', () => {
	showNextTest(+1);
});

addKeyCmd('ctrl enter', () => {
	start()
});

window.exportIds = () => {
	let str = '';
	for (let attr in window.data) {
		let val = window.data[attr];
		if (!(val instanceof Object)) {
			str += `data.${ attr } = ${ val };\n`;
		}
	}
	console.log(str);
};

window.loadScript = (path) => {
	$.post({
		url: '/load-script',
		data: path.toString(),
		async: false,
		success: (res) => {
			eval(res);
		}
	})
};

}