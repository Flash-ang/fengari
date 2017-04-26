"use strict";

const lua     = require('./lua.js');
const lauxlib = require('./lauxlib.js');

const IO_PREFIX = "_IO_";
const IOPREF_LEN = IO_PREFIX.length;
const IO_INPUT = lua.to_luastring(IO_PREFIX + "input");
const IO_OUTPUT = lua.to_luastring(IO_PREFIX + "output");

const tolstream = function(L) {
    return lauxlib.luaL_checkudata(L, 1, lauxlib.LUA_FILEHANDLE);
};

const isclosed = function(p) {
    return p.closef === null;
};

const f_tostring = function(L) {
    let p = tolstream(L);
    if (isclosed(p))
        lua.lua_pushliteral(L, "file (closed)");
    else
        lua.lua_pushstring(L, lua.to_luastring(`file (${p.f.toString()})`));
    return 1;
};

const newprefile = function(L) {
    let p = lua.lua_newuserdata(L);
    p.f = null;
    p.closef = null;
    lauxlib.luaL_setmetatable(L, lauxlib.LUA_FILEHANDLE);
    return p;
};

const iolib = {
};

const flib = {
    "__tostring": f_tostring
};

const createmeta = function(L) {
    lauxlib.luaL_newmetatable(L, lauxlib.LUA_FILEHANDLE);  /* create metatable for file handles */
    lua.lua_pushvalue(L, -1);  /* push metatable */
    lua.lua_setfield(L, -2, lua.to_luastring("__index", true));  /* metatable.__index = metatable */
    lauxlib.luaL_setfuncs(L, flib, 0);  /* add file methods to new metatable */
    lua.lua_pop(L, 1);  /* pop new metatable */
};

const io_noclose = function(L) {
    let p = tolstream(L);
    p.closef = io_noclose;
    lua.lua_pushnil(L);
    lua.lua_pushliteral(L, "cannot close standard file");
    return 2;
};

const createstdfile = function(L, f, k, fname) {
    let p = newprefile(L);
    p.f = f;
    p.closef = io_noclose;
    if (k !== null) {
        lua.lua_pushvalue(L, -1);
        lua.lua_setfield(L, lua.LUA_REGISTRYINDEX, k);  /* add file to registry */
    }
    lua.lua_setfield(L, -2, fname);  /* add file to module */
};

const luaopen_io = function(L) {
    lauxlib.luaL_newlib(L, iolib);
    createmeta(L);
    /* create (and set) default files */
    createstdfile(L, process.stdin, IO_INPUT, lua.to_luastring("stdin"));
    createstdfile(L, process.stdout, IO_OUTPUT, lua.to_luastring("stdout"));
    createstdfile(L, process.stderr, null, lua.to_luastring("stderr"));
    return 1;
};

module.exports.luaopen_io = luaopen_io;
