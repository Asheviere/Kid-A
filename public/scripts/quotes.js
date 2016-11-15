var edited = new Set();

var editing = null;

function edit(elem) {
    if (editing) {
        disable(editing);
    }
    elem.className = "input";
    editing = elem;
}

function disable(elem) {
    elem.className = "disabledinput";
}

function markEdited(quote) {
    edited.add(quote.name);
}

function submit() {
    if (editing) {
        disable(editing);
    }
    var docs = document.getElementsByTagName("input");
    var toDelete = [];
    var edits = {};
    for (var i = 0; i < docs.length; i++) {
        if (docs[i].type === "checkbox" && docs[i].checked) {
            toDelete.push(docs[i].name);
        } else if (docs[i].type === "text" && edited.has(docs[i].name)) {
            edits[docs[i].name] = docs[i].value;
        }
    }

    if (!(Object.keys(edits).length || toDelete.length)) return;

    // I can't find a better way to do this online. Without JQuery that is but that seems like overkill to me.
    document.body.innerHTML += '<form id="hack" action="' + window.location.href + '" method="post"><input type="hidden" name="data" value="' + encodeURIComponent(JSON.stringify({delete: toDelete, edits: edits})) + '"></form>';
    document.getElementById("hack").submit();
}