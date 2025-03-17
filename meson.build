# --------------------
# Project files
# --------------------
project(
  'FFmpeg bindings for Node.js',
  ['cpp'],
  default_options: ['buildtype=release', 'cpp_std=c++17', 'b_vscrt=static_from_buildtype'],
  subproject_dir: 'deps',
  meson_version: '>=1.5.0',
)
module_name = 'node-ffmpeg'

# ffmpeg expects the C99 macros to be available in C++
add_project_arguments('-D__STDC_CONSTANT_MACROS', language: ['cpp'])

# Parsing of the npm options happens at this point
napi = import('node-api')

sources = [
  'src/binding/avcpp-nobind.cc',
  'src/binding/avcpp-frame.cc',
  'src/binding/avcpp-readable.cc',
  'src/binding/avcpp-writable.cc',
]

avcpp_proj = subproject('avcpp', default_options: ['default_library=static'])
avcpp_dep = avcpp_proj.get_variable('avcpp_dep')

# --------------------
# Build the module
# --------------------
binary = napi.extension_module(
  module_name,
  sources,
  include_directories: ['src', 'node_modules/nobind17/include'],
  install: true,
  dependencies: [avcpp_dep],
  cpp_args: ['-DNOBIND_WARN_ON_EVENT_LOOP_BLOCK'],
)

# --------------------
# Produce the TypeScript definitions
# --------------------
if get_option('b_sanitize') == 'none'
  # If ASAN is enabled, node won't be able to load the module without it
  node = find_program('node')
  custom_target(
    'index.d.ts',
    output: 'index.d.ts',
    input: binary,
    command: [
      node,
      '-e', 'fs.writeFileSync(process.argv[2], require(path.resolve(process.argv[1])).__typescript)',
      '@INPUT@',
      '@OUTPUT@',
    ],
    install: true,
    install_dir: '',
  )
endif
