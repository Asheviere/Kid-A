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
    var output = {};

    for (var i = 0; i < docs.length; i++) {
        if (!docs[i].checked && checked.indexOf(docs[i].name) > -1) {
            output[docs[i].name] = false;
        } else if (docs[i].checked && checked.indexOf(docs[i].name) < 0) {
            output[docs[i].name] = true;
        }
    }

    if (!(Object.keys(output).length)) return;

    // I can't find a better way to do this online. Without JQuery that is but that seems like overkill to me.
    document.body.innerHTML += '<form id="hack" action="' + window.location.href + '" method="post"><input type="hidden" name="data" value="' + encodeURIComponent(JSON.stringify(output)) + '"></form>';
    document.getElementById("hack").submit();
}