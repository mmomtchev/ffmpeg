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
cpp_args = get_option('cpp_args')
cpp_args += '-DNOBIND_WARN_ON_EVENT_LOOP_BLOCK'
if host_machine.system() == 'windows'
  cpp_args += '/bigobj'
endif

avcpp_proj = subproject('avcpp', default_options: ['default_library=static'])
avcpp_dep = avcpp_proj.get_variable('avcpp_dep')

# This clash between Node.js and meson design principles is horrible:
#  the path to nobind17 is relative in development and absolute in production
fs = import('fs')
nobind17_inc = include_directories(
  fs.relative_to(
    run_command('node', '-p', 'require("nobind17").include', check: true).stdout().strip().replace('"', ''),
    meson.current_source_dir(),
  ),
)

# --------------------
# Build the module
# --------------------
binary = napi.extension_module(
  module_name,
  sources,
  include_directories: ['src', nobind17_inc],
  install: true,
  dependencies: [avcpp_dep],
  cpp_args: cpp_args,
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
    # The root dir is ./lib/binding/platform-arch
    # while index.d.ts goes in ./lib/binding
    install_dir: '..',
  )
endif
