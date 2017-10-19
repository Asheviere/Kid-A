function createBarGraph(labels, data, elementName, bias) {
	var margins = {top: 20, right: 10, bottom: 70, left: 50};

	var width = 1000 - margins.left - margins.right;
	var height = 500 - margins.top - margins.bottom;
	var barWidth = 20;

	var yscale = d3.scaleLinear().domain([0, d3.max(data)]).range([0, height]);
	var xscale = d3.scaleBand().domain(labels).range([0, width]);

	var vscale = d3.scaleLinear().domain([0, d3.max(data)]).range([height, 0]);
	var vaxis = d3.axisLeft().scale(vscale).ticks(20);

	var haxis = d3.axisBottom().scale(xscale).ticks(labels.length);

	d3.select(elementName)
		.append('svg')
		.attr('width', 1000)
		.attr('height', 500)
		.selectAll('rect').data(data)
		.enter().append('rect')
		.style('fill', '#5253D2')
		.attr('width', barWidth)
		.attr('height', function(data) {
			return yscale(data);
		})
		.attr('x', function(data, i) {
				return xscale(labels[i]) + margins.left + bias;
		})
		.attr('y', function(data) {
				return height - yscale(data) + margins.top;
		});

	var vguide = d3.select(elementName + ' svg').append('g');
	vaxis(vguide);
	vguide.attr('transform', 'translate(' + margins.left + ', ' + margins.top + ')');
	vguide.selectAll('path')
		.style('fill', 'none')
		.style('stroke', "black");
	vguide.selectAll('line')
		.style('stroke', "black");

	var hguide = d3.select(elementName + ' svg').append('g');
	haxis(hguide);
	hguide.attr('transform', 'translate(' + margins.left + ', ' + (height + margins.top) + ')');
	hguide.selectAll('path')
		.style('fill', 'none')
		.style('stroke', "black");
	hguide.selectAll('line')
		.style('stroke', "black");
}

var axis;

function createHorizontalBars(labels, data, elementName, bias, onClick) {
	var margins = {top: 30, right: 20, bottom: 0, left: 180};

	var width = 1200 - margins.left - margins.right;
	var height = 1500 - margins.top - margins.bottom;
	var barHeight = 20;

	var yscale = d3.scaleBand().domain(labels).range([0, height]);
	var xscale = d3.scaleLinear().domain([0, d3.max(data)]).range([0, width]);

	var hscale = d3.scaleLinear().domain([0, d3.max(data)]).range([0, width]);
	var haxis = d3.axisTop().scale(hscale).ticks(20);

	var vaxis = d3.axisLeft().scale(yscale).ticks(labels.length);
	axis = vaxis;

	d3.select(elementName)
		.append('svg')
		.attr('width', 1200)
		.attr('height', 1500)
		.selectAll('rect').data(data)
		.enter().append('rect')
		.style('fill', '#5253D2')
		.attr('height', barHeight)
		.attr('width', function(data) {
			return xscale(data);
		})
		.attr('y', function(data, i) {
			return yscale(labels[i]) + margins.top + bias;
		})
		.attr('x', function(data) {
			return margins.left;
		}).append('title').text(function(data) {
			return data;
		});

	var linecounturl = window.location.href.split('/').slice(0, -1).join('/') + '/linecount?' + window.location.href.split('?')[1].split('&')[0] + '&user=';

	var vguide = d3.select(elementName + ' svg').append('g');
	vaxis(vguide);
	vguide.attr('transform', 'translate(' + margins.left + ', ' + margins.top + ')');
	vguide.attr('font-size', '11pt');
	vguide.selectAll('text').attr('fill', '#5253D2').html(function() {
		return '<a href="' + linecounturl + this.__data__ + '">' + this.__data__ + '</a>';
	});
	vguide.selectAll('path')
		.style('fill', 'none')
		.style('stroke', "black");
	vguide.selectAll('line')
		.style('stroke', "black");

	var hguide = d3.select(elementName + ' svg').append('g');
	haxis(hguide);
	hguide.attr('transform', 'translate(' + margins.left + ', ' + margins.top + ')');
	hguide.selectAll('path')
		.style('fill', 'none')
		.style('stroke', "black");
	hguide.selectAll('line')
		.style('stroke', "black");
}