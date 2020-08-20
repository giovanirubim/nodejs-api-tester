{
	const date = (date = new Date()) => (
		(date.getFullYear() + '').padStart(4, '0') + '-' +
		((date.getMonth() + 1) + '').padStart(2, '0') + '-' +
		(date.getDate() + '').padStart(2, '0')
	);
	const time = (date = new Date()) => (
		(date.getHours() + '').padStart(2, '0') + ':' +
		(date.getMinutes() + '').padStart(2, '0') + ':' +
		(date.getSeconds() + '').padStart(2, '0')
	);
	const datetime = (t = new Date()) => date(t) + ' ' + time(t);
	window.SqlDate = {
		date, datetime, time,
		isValid: (string) => {
			if (!/^\d{4}(-\d{2}){2}$/.test(string)) return false;
			return string === date(new Date(string + ' 00:00:00'));
		}
	};
}