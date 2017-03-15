"use strict";

const assert  = require('assert');

const lua     = require('./lua.js');
const lapi    = require('./lapi.js');
const lauxlib = require('./lauxlib.js');

const MAXUNICODE = 0x10FFFF;

const iscont = function(p) {
    let c = p & 0xC0;
    return c === 0x80;
};

/* translate a relative string position: negative means back from end */
const u_posrelat = function(pos, len) {
    if (pos >= 0) return pos;
    else if (0 - pos > len) return 0;
    else return len + pos + 1;
};

/*
** Decode one UTF-8 sequence, returning NULL if byte sequence is invalid.
*/
const utf8_decode = function(s, val) {
    let limits = [0xFF, 0x7F, 0x7FF, 0xFFFF];
    let c = s[0];
    let res = 0;  /* final result */
    if (c < 0x80)  /* ascii? */
        res = c;
    else {
        let count = 0;  /* to count number of continuation bytes */
        while (c & 0x40) {  /* still have continuation bytes? */
            let cc = s[++count];  /* read next byte */
            if ((cc & 0xC0) != 0x80)  /* not a continuation byte? */
                return null;  /* invalid byte sequence */
            res = (res << 6) | (cc & 0x3F);  /* add lower 6 bits from cont. byte */
            c <<= 1;  /* to test next bit */
        }
        res |= ((c & 0x7F) << (count * 5));  /* add first byte */
        if (count > 3 || res > MAXUNICODE || res <= limits[count])
            return null;  /* invalid byte sequence */
        s = s.slice(count);  /* skip continuation bytes read */
    }

    return {
        string: s.slice(1),  /* +1 to include first byte */
        code: res
    };
};

/*
** offset(s, n, [i])  -> index where n-th character counting from
**   position 'i' starts; 0 means character at 'i'.
*/
const byteoffset = function(L) {
    let s = lauxlib.luaL_checkstring(L, 1);
    s = L.stack[lapi.index2addr_(L, 1)].value;
    let n = lauxlib.luaL_checkinteger(L, 2);
    let posi = n >= 0 ? 1 : s.length + 1;
    posi = u_posrelat(lauxlib.luaL_optinteger(L, 3, posi), s.length);

    lauxlib.luaL_argcheck(L, 1 <= posi && --posi <= s.length, 3, "position ot ouf range");

    if (n === 0) {
        /* find beginning of current byte sequence */
        while (posi > 0 && iscont(s[posi])) posi--;
    } else {
        if (iscont(s[posi]))
            lauxlib.luaL_error(L, "initial position is a continuation byte");

        if (n < 0) {
            while (n < 0 && posi > 0) {  /* move back */
                do {  /* find beginning of previous character */
                    posi--;
                } while (posi > 0 && iscont(s[posi]));
                n++;
            }
        } else {
            n--;  /* do not move for 1st character */
            while (n > 0 && posi < s.length) {
                do {  /* find beginning of next character */
                    posi++;
                } while (iscont(s[posi]));  /* (cannot pass final '\0') */
                n--;
            }
        }
    }

    if (n === 0)  /* did it find given character? */
        lapi.lua_pushinteger(L, posi + 1);
    else  /* no such character */
        lapi.lua_pushnil(L);

    return 1;
};

/*
** codepoint(s, [i, [j]])  -> returns codepoints for all characters
** that start in the range [i,j]
*/
const codepoint = function(L) {
    let s = lauxlib.luaL_checkstring(L, 1);
    s = L.stack[lapi.index2addr_(L, 1)].value;
    let posi = u_posrelat(lauxlib.luaL_optinteger(L, 2, 1), s.length);
    let pose = u_posrelat(lauxlib.luaL_optinteger(L, 3, posi), s.length);

    lauxlib.luaL_argcheck(L, posi >= 1, 2, "out of range");
    lauxlib.luaL_argcheck(L, pose <= s.length, 3, "out of range");

    if (posi > pose) return 0;  /* empty interval; return no values */
    if (pose - posi >= Number.MAX_SAFE_INTEGER)
        return lauxlib.luaL_error(L, "string slice too long");
    let n = (pose - posi) + 1;
    lauxlib.luaL_checkstack(L, n, "string slice too long");
    n = 0;
    for (s = s.slice(posi - 1); n < pose - posi;) {
        let dec = utf8_decode(s);
        if (dec === null)
            return lauxlib.luaL_error(L, "invalid UTF-8 code");
        s = dec.string;
        let code = dec.code;
        lapi.lua_pushinteger(L, code);
        n++;
    }
    return n;
};

const funcs = {
    "codepoint": codepoint,
    "offset":    byteoffset
};

/* pattern to match a single UTF-8 character */
const UTF8PATT = "[\0-\x7F\xC2-\xF4][\x80-\xBF]*";

const luaopen_utf8 = function(L) {
    lauxlib.luaL_newlib(L, funcs);
    lapi.lua_pushstring(L, UTF8PATT);
    lapi.lua_setfield(L, -2, "charpattern");
    return 1;
};

module.exports.luaopen_utf8 = luaopen_utf8;