/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from "fs"
import * as shell from "shelljs"

shell.cp(
	"-r",
	[
		"package.json",
		"package-lock.json",
		"README.MD",
	],
	"dist",
)

shell.rm("-r", "dist/build-scripts")

const packageJson = JSON.parse(fs.readFileSync("./dist/package.json", "utf-8"))
delete packageJson.scripts
packageJson.main = "./index.js"
fs.writeFileSync("./dist/package.json", JSON.stringify(packageJson))