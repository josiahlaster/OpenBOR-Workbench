(function() {
    const myGame = window.myGame;

    const canvas = myGame.canvas;
    canvas.style.display = 'block';
    canvas.focus();
    function getClosestMultiplier(baseWidth, baseHeight, windowWidth, windowHeight) {
        const maxWidthMultiplier = Math.floor(windowWidth / baseWidth);
        const maxHeightMultiplier = Math.floor(windowHeight / baseHeight);
        const maxMultiplier = Math.min(maxWidthMultiplier, maxHeightMultiplier);

        let multiplier = maxMultiplier;

        // Try to adjust for .25, .50, .75 steps
        while (multiplier > 0) {
            let candidateMultipliers = [multiplier, multiplier + 0.25, multiplier + 0.5, multiplier + 0.75].filter(
                m => baseWidth * m <= windowWidth && baseHeight * m <= windowHeight
            );

            if (candidateMultipliers.length > 0) {
                return candidateMultipliers[candidateMultipliers.length - 1];
            }
            multiplier -= 1;
        }
        return 1;
    }
    function resizeCanvas() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let selectedMultiplier = getClosestMultiplier(myGame.baseWidth, myGame.baseHeight, windowWidth, windowHeight);

        const newWidth = myGame.baseWidth * selectedMultiplier;
        const newHeight = myGame.baseHeight * selectedMultiplier;

        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;  // decimal multipliers are not good for pixel art. most devices should be max resolution anyway
        console.log(`canvas size: ${newWidth}px x ${newHeight}px Multiplayer: ${selectedMultiplier}`)
    }


    function isMobileDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	}

    myGame.unzipFile = async function(zipFilePath) {
        try {
            const response = await fetch(zipFilePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${zipFilePath}: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            let unzipData;
            try {
                unzipData = fflate.unzipSync(new Uint8Array(arrayBuffer));
            } catch (error) {
                console.error(`Error during unzipping ${zipFilePath}:`, error);
                throw error;
            }

            if (unzipData) {
                const result = {};
                const mimeTypeMap = {
                    'txt': 'text/plain',
                    'html': 'text/html',
                    'js': 'application/javascript',
                    'css': 'text/css',
                    'json': 'application/json',
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'gif': 'image/gif',
                    'svg': 'image/svg+xml',
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'mp4': 'video/mp4',
                    'webm': 'video/webm',
                    'wasm': 'application/wasm',
                    'webp': 'image/webp'
                    // Add more mappings as needed
                };

                for (const filename in unzipData) {
                    const fileData = unzipData[filename];
                    const extension = filename.split('.').pop().toLowerCase();
                    const mimeType = mimeTypeMap[extension] || 'application/octet-stream';

                    const blob = new Blob([fileData], { type: mimeType });
                    const blobURL = URL.createObjectURL(blob);
                    result[filename] = blobURL;
                }

                return result;
            } else {
                throw new Error(`Unzipping ${zipFilePath} failed, unzipData is undefined`);
            }
        } catch (error) {
            console.error(`Failed to unzip file ${zipFilePath}:`, error);
            throw error;
        }
    };

    myGame.unzipToFS = async function(zipFilePaths) {
        const zipFiles = Array.isArray(zipFilePaths) ? zipFilePaths : [zipFilePaths];
        try {
            for (const zipFilePath of zipFiles) {

                const response = await fetch(zipFilePath);
                if (!response.ok) {
                    throw new Error(`Failed to load ${zipFilePath}: ${response.status} ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();

                let unzipData;
                try {
                    unzipData = fflate.unzipSync(new Uint8Array(arrayBuffer));
                } catch (error) {
                    console.error(`Error during unzipping ${zipFilePath}:`, error);
                    throw error;
                }

                if (unzipData) {
                    const foldersToCreate = new Set();
                    const filesToWrite = new Set();

                    for (let filename in unzipData) {
                        const fileData = unzipData[filename];
                        const fullPath = '/' + filename;
                        const folderPath = fullPath.substring(0, fullPath.lastIndexOf('/'));

                        if (fileData.length === 0) {
                            foldersToCreate.add(folderPath);
                        } else {
                            filesToWrite.add({ fullPath, fileData });
                        }
                    }

                    foldersToCreate.forEach(folderPath => {
                        try {
                            FS.mkdirTree(folderPath);
                        } catch (e) {
                            console.warn(`Folder creation skipped or failed for ${folderPath}:`, e);
                        }
                    });

                    filesToWrite.forEach(({ fullPath, fileData }) => {
                        try {
                            FS.writeFile(fullPath, fileData);
                        } catch (error) {
                            console.error(`Error writing file ${fullPath}:`, error);
                        }
                    });
                } else {
                    throw new Error(`Unzipping ${zipFilePath} failed, unzipData is undefined`);
                }
            }
        } catch (error) {
            console.error('Failed to unzip to FS:', error);
            throw error;
        }
    };

    function unzipOpenBOR() {
        return myGame.unzipFile(myGame.paths['OpenBOR.zip'], {
        }).then(result => {
            myGame.unzippedFiles = result;
        });
    }

    function startGame() {
		window.Module= {
			locateFile: function(path) {
				if (path.endsWith('.wasm')) {
					return myGame.unzippedFiles['OpenBOR.wasm'];
				}
				return path;
			},
			preRun: [
				function() {
					window.Module.addRunDependency('unpack');

                    try {
                        FS.mkdir('/Paks');
                    } catch (e) {
                        console.log("/Paks directory already exists");
                    }
                    const pakFilename = `${document.title}.pak`;
					if (myGame.assetType === 'pak') {
						FS.createPreloadedFile('/Paks', pakFilename, myGame.paths.assetsPaths[0], true, false,
							function() {
								console.log(`Successfully loaded ${pakFilename}`);
								window.Module.removeRunDependency('unpack');
                                myGame.LoadingOverlay.style.display = 'none';
							},
							function() {
								console.error(`Successfully loaded ${pakFilename}`);
								window.Module.removeRunDependency('unpack');
                                myGame.LoadingOverlay.innerText = 'Unpacking error';
							}
						);
						window.Module.arguments = [];
					} else {
						myGame.unzipToFS(myGame.paths.assetsPaths)
							.then(() => {
                                try {
                                    FS.writeFile(`/Paks/${pakFilename}`, new Uint8Array());
                                    console.log(`Created empty pak file: /Paks/${pakFilename}`);
                                } catch (e) {
                                    console.error(`Failed to create empty pak file: /Paks/${pakFilename}`, e);
                                }
								window.Module.removeRunDependency('unpack');
                                myGame.LoadingOverlay.style.display = 'none';
							})
							.catch(error => {
								console.error('Failed to unzip game files:', error);
								window.Module.removeRunDependency('unpack');
                                myGame.LoadingOverlay.innerText = 'Unpacking error';
							});
					};
				}
			],
			arguments: [],
			canvas: myGame.canvas,
			onRuntimeInitialized: function() {
				console.log('WASM module initialized');
			},
			print: function(text) {
				console.log(text);
			},
			printErr: function(text) {
				console.error(text);
			},
			setStatus: function(text) {
				if (text) {
					console.log(text);
				}
			}
		};

        const script = document.createElement('script');
        script.id = 'openbor-script';
        script.src = myGame.unzippedFiles['OpenBOR.js'];
        script.onload = () => {
            console.log('OpenBOR.js script loaded');
        };
        script.onerror = () => {
            console.error('Failed to load OpenBOR.js script');
        };
        document.body.appendChild(script);
    }

    function initGame() {

        if (isMobileDevice()) {
            const  mobileScript = document.createElement('script');
            mobileScript.src = myGame.paths['mobile.js'];
            mobileScript.onload = function() {
                console.log('Mobile script loaded');
            };
            mobileScript.onerror = function() {
                console.error('Failed to load mobile.js');
            };
            document.head.appendChild(mobileScript);
        }

        unzipOpenBOR().then(() => {
            startGame();
        }).catch((error) => {
            console.error('Failed to unzip and prepare OpenBOR:', error);
        });
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const fflateScript = document.createElement('script');
    fflateScript.src = myGame.paths['fflate.min.js'];
    fflateScript.onload = () => {
        initGame();
    };
    fflateScript.onerror = () => {
        console.error('Failed to load fflate script');
    };
    document.head.appendChild(fflateScript);

})();