module.exports = (json) => {
	return JSON.parse(json
		.replace(/("([^\\"]|\\.)*")|\/\/[^\n]*(\n|$)|\s+/g, '$1')
		.replace(/("([^\\"]|\\.)*")|,+(}|\])|(,),+/g, '$1$3$4'));
};