# --------------------
# Project files
# --------------------
project('FFmpeg bindings for Node.js',
  [ 'cpp' ],
  default_options : [
    'buildtype=release',
    'cpp_std=c++17',
    'b_vscrt=static_from_buildtype'
  ],
  subproject_dir: 'deps',
  meson_version: '>=1.5.0'
)
module_name = 'node-ffmpeg'

# Parsing of the npm options happens at this point
napi = import('node-api')
 
sources = [
  'src/binding/avcpp-nobind.cc',
  'src/binding/avcpp-frame.cc',
  'src/binding/avcpp-readable.cc',
  'src/binding/avcpp-writable.cc'
]

avcpp_proj = subproject('avcpp')
avcpp_dep = avcpp_proj.get_variable('avcpp_dep')

# --------------------
# Build the module
# --------------------
napi.extension_module(
  module_name,
  sources,
  include_directories : [ 'src', 'node_modules/nobind17/include' ],
  install             : true,
  dependencies        : [ avcpp_dep ]
)
