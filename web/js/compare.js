const clone = (value) => {
	return value && JSON.parse(JSON.stringify(value));
};
const matchesIn = (a, b) => {
	if (!(b instanceof Object)) {
		return a === b;
	}
	if (!(a instanceof Object)) {
		return false;
	}
	for (let attr in b) {
		if (!matchesIn(a[attr], b[attr])) {
			return false;
		}
	}
	return true;
};
const matches = (a, b) => matchesIn(a, b) && matchesIn(b, a);