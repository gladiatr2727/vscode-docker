import vscode = require('vscode');
import { ImageItem, quickPickImage } from './utils/quick-pick-image';
import { DockerEngineType, docker } from './utils/docker-endpoint';
import * as cp from 'child_process';
import os = require('os');
import { reporter } from '../telemetry/telemetry';
import { DockerNode } from '../explorer/dockerExplorer';

const teleCmdId: string = 'vscode-docker.container.start';

async function doStartContainer(context:DockerNode, interactive: boolean) {
    let imageName: string = "";
    let selectedItem: ImageItem;

    // if invokde from the explorer we have the name of the image
    // otherwise open a quick pick list
    if (context) {
        selectedItem = context.image;
        imageName = context.label;
    } else {
        selectedItem = await quickPickImage(false);
    }

    // if the user pressed cancel on the quick pick, we won't have an image name
    if (selectedItem) {
        docker.getExposedPorts(imageName).then((ports: string[]) => {
            let options = `--rm ${interactive ? '-it' : '-d'}`;
            if (ports.length) {
                const portMappings = ports.map((port) => `-p ${port}:${port}`);
                options += ` ${portMappings.join(' ')}`;
            }
            
            const terminal = vscode.window.createTerminal(imageName);
            terminal.sendText(`docker run ${options} ${imageName}`);
            terminal.show();

            if (reporter) {
                reporter.sendTelemetryEvent('command', {
                    command: interactive ? teleCmdId + '.interactive' : teleCmdId
                });
            }
        });
    }
}

export function startContainer(context: DockerNode) {
    // if invoked from explorer, we will get the Node passed in
    doStartContainer(context, false);
}

export function startContainerInteractive(context: DockerNode) {
    doStartContainer(context, true);
}

export async function startAzureCLI() {

    // block of we are running windows containers... 
    const engineType: DockerEngineType = await docker.getEngineType();

    if (engineType === DockerEngineType.Windows) {
        const selected = await vscode.window.showErrorMessage<vscode.MessageItem>('Currently, you can only run the Azure CLI when running Linux based containers.',
            {
                title: 'More Information',
            },
            {
                title: 'Close',
                isCloseAffordance: true
            }
        );
        if (!selected || selected.isCloseAffordance) {
            return;
        }
        return cp.exec('start https://docs.docker.com/docker-for-windows/#/switch-between-windows-and-linux-containers');
    } else {
        const option: string = process.platform === 'linux' ? '--net=host' : '';

        // volume map .azure folder so don't have to log in every time
        const homeDir: string = process.platform === 'win32' ? os.homedir().replace(/\\/g, '/') : os.homedir();
        const vol: string = `-v ${homeDir}/.azure:/root/.azure -v ${homeDir}/.ssh:/root/.ssh -v ${homeDir}/.kube:/root/.kube`;
        const cmd: string = `docker run ${option} ${vol} -it --rm azuresdk/azure-cli-python:latest`;

        const terminal: vscode.Terminal = vscode.window.createTerminal('Azure CLI');
        terminal.sendText(cmd);
        terminal.show();
        if (reporter) {
            reporter.sendTelemetryEvent('command', {
                command: teleCmdId + '.azurecli'
            });
        }
    }
}