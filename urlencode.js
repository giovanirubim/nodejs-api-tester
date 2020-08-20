// ------------------------------ <==============================> ------------------------------ //
// Método que codifica um objeto que pode possuir objetos aninhados no formato x-www-form-urlencoded
// ------------------------------ <==============================> ------------------------------ //
// Variáveis globais auxiliares

const open = encodeURIComponent('[');
const close = encodeURIComponent(']');
const append = open + close;

// ------------------------------ <==============================> ------------------------------ //
// Public

module.exports = root => {
	let path = '';
	let res = '';
	const add = (value) => {
		if (!(value instanceof Object)) {
			res += path + (value == null? '=&': `=${ encodeURIComponent(value) }&`);
			return;
		}
		let prev = path;
		if (value instanceof Array) {
			value.forEach((value, index) => {
				if (value instanceof Object) {
					path = prev + open + index + close;
				} else {
					path = prev + append;
				}
				add(value);
			});
		} else {
			for (let attr in value) {
				path = prev + encodeURIComponent(`[${ attr }]`);
				add(value[attr]);
			}
		}
	};
	for (let attr in root) {
		path = attr;
		add(root[attr]);
	}
	return res.substr(0, res.length - 1);
};

// Fim de Arquivo
// ------------------------------ <==============================> ------------------------------ //