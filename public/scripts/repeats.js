function submit() {
    var docs = document.getElementsByTagName("input");
    var toDelete = [];
    for (var i = 0; i < docs.length; i++) {
        if (docs[i].type === "checkbox" && docs[i].checked) {
            toDelete.push(docs[i].name);
        }
    }

    if (!toDelete.length) return;

    // I can't find a better way to do this online. Without JQuery that is but that seems like overkill to me.
    document.body.innerHTML += '<form id="hack" action="' + window.location.href + '" method="post"><input type="hidden" name="data" value="' + encodeURIComponent(JSON.stringify(toDelete)) + '"></form>';
    document.getElementById("hack").submit();
}