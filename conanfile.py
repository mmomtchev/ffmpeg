from conan import ConanFile

required_conan_version = ">=2.0.0"

class ffmpeg(ConanFile):
    settings = 'os', 'compiler', 'build_type', 'arch'
    requires = 'ffmpeg/6.0'
    generators = 'json'

    def configure(self):
      self.options['ffmpeg'].shared = False
      self.options['libx256'].shared = False
      if self.settings.os != 'Windows':
        self.options['ffmpeg'].fPIC = False
        self.options['ffmpeg'].with_libalsa = False
        self.options['ffmpeg'].with_pulse = False
        self.options['ffmpeg'].with_vulkan = False
        self.options['ffmpeg'].with_xcb = False
        self.options['ffmpeg'].with_vaapi = False
        self.options['ffmpeg'].with_vdpau = False
        self.options['ffmpeg'].disable_all_devices = True
