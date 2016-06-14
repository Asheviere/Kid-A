'use strict';

const deck = require('deck');
const Lazy = require('lazy');
const Hash = require('hashish');
const loki = require('lokijs');

module.exports = function (order) {
    if (!order) order = 2;
    let self = {};
    self.db = new loki.Collection('dummy', {});

    self.seed = function (seed) {
        let words = seed.split(/\s+/);
        let links = [];

        for (let i = 0; i < words.length; i += order) {
            let link = words.slice(i, i + order).join(' ');
            links.push(link);
        }

        if (links.length <= 1) {
            return;
        }

        for (let i = 1; i < links.length; i++) {
            let word = links[i-1];
            let cword = clean(word);
            let next = links[i];
            let cnext = clean(next);

            let node;

            if (this.db.findObject({'cword' : cword})) {
                node = this.db.findObject({'cword' : cword});
            } else {
                node = {
                    cword: cword,
                    count : 0,
                    words : {},
                    next : {},
                    prev : {},
                }
                this.db.insert(node);
            }

            node.count ++;
            node.words[word] = (
                Hash.has(node.words, word) ? node.words[word] : 0
            ) + 1;
            node.next[cnext] = (
                Hash.has(node.next, cnext) ? node.next[cnext] : 0
            ) + 1
            if (i > 1) {
                let prev = clean(links[i-2]);
                node.prev[prev] = (
                    Hash.has(node.prev, prev) ? node.prev[prev] : 0
                ) + 1;
            }
            else {
                node.prev[''] = (node.prev[''] || 0) + 1;
            }
        }

        let n;

        if (!this.db.findObject({'cword' : cnext})) {
            n = {
                cword: cnext,
                count : 1,
                words : {},
                next : { '' : 0 },
                prev : {},
            };
        } else {
            n = this.db.findObject({'cword' : cnext});
        }

        n.words[next] = (Hash.has(n.words, next) ? n.words[next] : 0) + 1;
        n.prev[cword] = (Hash.has(n.prev, cword) ? n.prev[cword] : 0) + 1;
        n.next[''] = (n.next[''] || 0) + 1;
    };

    self.search = function (text) {
        let words = text.split(/\s+/);

        // find a starting point...
        let start = null;
        let groups = {};
        for (let i = 0; i < words.length; i += order) {
            let word = clean(words.slice(i, i + order).join(' '));
            if (this.db.findObject({'cword' : word})) groups[word] = this.db.findObject({'cword' : word}).count;
        }

        return deck.pick(groups);
    };

    self.pick = function () {
        return deck.pick(this.db.findObjects({})).cword;
    };

    self.next = function (cur) {
        if (!cur || !this.db.findObject({'cword' : cur})) return undefined;

        let next = deck.pick(this.db.findObject({'cword' : cur}).next);
        return this.db.findObject({'cword' : next}) && {
            key : next,
            word : deck.pick(this.db.findObject({'cword' : next}).words),
        } || undefined;
    };

    self.prev = function (cur) {
        if (!cur || !this.db.findObject({'cword' : cur})) return undefined;

        let prev = deck.pick(this.db.findObject({'cword' : cur}).prev);
        return prev && {
            key : prev,
            word : deck.pick(this.db.findObject({'cword' : prev}).words),
        } || undefined;
    };

    self.forward = function (cur, limit) {
        let res = [];
        while (cur && !limit || res.length < limit) {
            let next = self.next(cur);
            if (!next) break;
            cur = next.key;
            res.push(next.word);
        }

        return res;
    };

    self.backward = function (cur, limit) {
        let res = [];
        while (cur && !limit || res.length < limit) {
            let prev = self.prev(cur);
            if (!prev) break;
            cur = prev.key;
            res.unshift(prev.word);
        }

        return res;
    };

    self.fill = function (cur, limit) {
        let res = [ deck.pick(this.db.findObject({'cword' : cur}).words) ];
        if (!res[0]) return [];
        if (limit && res.length >= limit) return res;

        let pcur = cur;
        let ncur = cur;

        while (pcur || ncur) {
            if (pcur) {
                let prev = self.prev(pcur);
                pcur = null;
                if (prev) {
                    pcur = prev.key;
                    res.unshift(prev.word);
                    if (limit && res.length >= limit) break;
                }
            }

            if (ncur) {
                let next = self.next(ncur);
                ncur = null;
                if (next) {
                    ncur = next.key;
                    res.unshift(next.word);
                    if (limit && res.length >= limit) break;
                }
            }
        }

        return res;
    };

    self.respond = function (text, limit) {
        let cur = self.search(text) || self.pick();
        return self.fill(cur, limit);
    };

    self.word = function (cur) {
        return this.db.findObject({'cword' : cur}) && deck.pick(this.db.findObject({'cword' : cur}).words);
    };

    return self;
};

function clean (s) {
    return s
        .toLowerCase()
        .replace(/[^a-z\d]+/g, '_')
        .replace(/^_/, '')
        .replace(/_$/, '')
    ;
}
