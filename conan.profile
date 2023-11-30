[settings]
os=Linux
os_build=Linux
arch=x86_64
arch_build=x86_64
compiler=gcc
compiler.version=11
# We use std:string and we are sensitive to the C++ ABI
# As nobind requires C++17, we think it is time to switch
# (if you do not know the C++ ABI changed in gcc 5
# https://developers.redhat.com/blog/2015/02/05/gcc5-and-the-c11-abi )
compiler.libcxx=libstdc++11
build_type=Release

[options]

[build_requires]

[env]
