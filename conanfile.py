from conan import ConanFile

required_conan_version = ">=1.60.0"

class ffmpeg(ConanFile):
    settings = 'os', 'compiler', 'build_type', 'arch'
    requires = 'ffmpeg/6.1'
    generators = 'json'

    def configure(self):
      self.options['ffmpeg'].disable_all_devices = True

      # On Windows we prefer /MT builds as these are not affected
      # by the infamous Windows DLL hell
      if self.settings.os == 'Windows':
        self.settings.compiler['Visual Studio'].runtime = 'MT'

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
