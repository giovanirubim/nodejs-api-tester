// ------------------------------ <==============================> ------------------------------ //
// Módulo destinado a criar requisições HTTP
// ------------------------------ <==============================> ------------------------------ //
// Dependências

const http = require('http');
const https = require('https');
const parseUrl = require('url').parse;
const urlencode = require('./urlencode.js');

// ------------------------------ <==============================> ------------------------------ //
// Variáveis globais auxiliares

// Mapeia os protocolos
const protocolMap = {
	'http:': http,
	'https:': https
};

// ------------------------------ <==============================> ------------------------------ //

// Faz uma requisição HTTP
module.exports = ({ url, type = 'GET', data, headers } = {}) => new Promise((done, fail) => {
		
	// Quebra a string url
	let { hostname, port, path, protocol } = parseUrl(url);

	// Verifica o protocolo
	if (!(protocol in protocolMap)) {
		fail(`Invalid protocol ${ protocol }`);
	}

	// Corpo a ser enviado
	let sendBody = null;
	
	if (data) {

		// Se os dados estão em formato de objeto é gerada uma string no formato de query
		if (data instanceof Object) {
			data = urlencode(data);
		}

		// Adiciona os dados
		if (type === 'GET') {
			path += (path.includes('?')? '&': '?') + data;
		} else {
			sendBody = data;
		}
	}

	// Cria a requisição
	const options = { hostname, port, path, method: type, headers };
	const req = protocolMap[protocol].request(options, res => {

		// Quebra o cabeçalho Content-Type
		const contentType = (res.headers['content-type'] || '').split(/\s*;\s*/);

		// Trata a resposta da requisição
		const {statusCode} = res;
		let responseText = '';
		res.on('data', chunk => responseText += chunk.toString('utf8'));
		res.on('end', () => {
			let response = contentType.includes('application/json')
				?JSON.parse(responseText)
				:responseText;
			done({ response, responseText, statusCode });
		});
		res.on('error', fail);

	});
	req.on('error', fail);

	// Envia o corpo da mensagem
	if (sendBody !== null) {
		req.write(sendBody);
	}

	// Envia a requisição
	req.end();

});

// Fim de arquivo
// ------------------------------ <==============================> ------------------------------ //