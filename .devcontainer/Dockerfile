FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04
COPY --from=ghcr.io/mathtrail/platform-env:1 /config/global.env /etc/mathtrail/platform.env

# Install Skaffold
RUN curl -Lo /tmp/skaffold "https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64" \
    && install /tmp/skaffold /usr/local/bin/skaffold \
    && rm -f /tmp/skaffold

# Install k3d
RUN curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Install Ory CLI tools (Kratos, Hydra, Keto, Oathkeeper)
RUN bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin kratos" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin hydra" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin keto" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin oathkeeper"

# Pre-configure Docker daemon to trust the k3d registry
RUN mkdir -p /etc/containers/registries.conf.d && \
    printf '[registry]\nlocation = "k3d-mathtrail-registry.localhost:5050"\ninsecure = true\n' \
    > /etc/containers/registries.conf.d/k3d.conf
