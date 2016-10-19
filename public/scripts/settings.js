let checked = [];

window.onload = function() {
    var docs = document.getElementsByTagName("input");

    for (var i = 0; i < docs.length; i++) {
        if (docs[i].checked) {
            checked.push(docs[i].name);
        }
    }
}

function submit() {
    var docs = document.getElementsByTagName("input");
    var output = '';

    for (var i = 0; i < docs.length; i++) {
        if (!docs[i].checked && checked.indexOf(docs[i].name) > -1) {
            output += '&' + docs[i].name + '=false';
        } else if (docs[i].checked && checked.indexOf(docs[i].name) < 0) {
            output += '&' + docs[i].name + '=true';
        }
    }

    window.location.href += output;
}