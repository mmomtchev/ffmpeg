from conan import ConanFile

required_conan_version = ">=2.0.0"

class ffmpeg(ConanFile):
    settings = 'os', 'compiler', 'build_type', 'arch'
    requires = 'ffmpeg/7.1.1'
    tool_requires = 'pkgconf/2.1.0'
    generators = 'MesonToolchain', 'PkgConfigDeps'

    def configure(self):
      self.options['ffmpeg'].disable_all_devices = True

      # Linux and macOS
      if self.settings.os != 'Windows':
        self.options['ffmpeg'].fPIC = True

      # Linux only
      if self.settings.os == 'Linux':
        self.options['ffmpeg'].with_libalsa = False
        self.options['ffmpeg'].with_pulse = False
        self.options['ffmpeg'].with_vulkan = False
        self.options['ffmpeg'].with_xcb = False
        self.options['ffmpeg'].with_vaapi = False
        self.options['ffmpeg'].with_vdpau = False
        self.options['ffmpeg'].with_xlib = False
