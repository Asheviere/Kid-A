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