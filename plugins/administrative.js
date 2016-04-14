module.exports = {
    reload: function(symbol, room, message) {
        if (!canUse(symbol, 5)) return {pmreply: "Permission denied."};

        switch (message) {
            case 'data':
                loadData();
                return {reply: "Data reloaded succesfully."};
                break;
            default:
                return {pmreply: "Invalid option."};
        }
    }
};
