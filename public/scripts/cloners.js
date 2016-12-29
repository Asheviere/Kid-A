var edited = {};

var editing = null;

function toId(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function filter() {
    var docs = document.getElementsByTagName("tr");

    for (var i = 0; i < docs.length; i++) {
        if (docs[i].className !== 'online' && docs[i].className !== 'header') {
            docs[i].style.display = 'none';
        }
    }
}

function unfilter() {
    var docs = document.getElementsByTagName("tr");

    for (var i = 0; i < docs.length; i++) {
        if (docs[i].className !== 'online' && docs[i].className !== 'header') {
            docs[i].style.display = 'table-row';
        }
    }
}

function toggleFilter(checkbox) {
    if (checkbox.checked) {
        filter();
    } else {
        unfilter();
    }
}

function edit(elem) {
    if (editing) {
        disable(editing);
    }
    elem.className = "input";
    editing = elem;
}

function markEdited(elem, id) {
    elem.size = elem.value.length + 2;
    if (!(id in edited)) {
        edited[id] = {};
    }
    edited[id][elem.name] = elem.value;
}

function disable(elem) {
    elem.className = "disabledinput";
}

function submit() {
    if (editing) {
        disable(editing);
    }
    var docs = document.getElementsByTagName("tr");
    var edits = {};
    for (var i = 0; i < docs.length; i++) {
        var id = docs[i].id;
        if (!id) continue;

        var elems = docs[i].children;

        for (let j = 0; j < elems.length; j++) {
            if (!elems[j].children.length) continue;
            var field = elems[j].children[0].name;
            if (!field) continue;

            else if (edited[id] && edited[id][field]) {
                if (!(id in edits)) {
                    edits[toId(elems[0].innerHTML)] = {};
                }
                edits[toId(elems[0].innerHTML)][field] = elems[j].children[0].value;
            }
        }
    }

    if (!Object.keys(edits).length) return;

    // I can't find a better way to do this online. Without JQuery that is but that seems like overkill to me.
    document.body.innerHTML += '<form id="hack" action="' + window.location.href + '" method="post"><input type="hidden" name="data" value="' + encodeURIComponent(JSON.stringify({edits: edits})) + '"></form>';
    document.getElementById("hack").submit();
}