<template>
  <div class="user-manager">
    <div class="section-header">
      <span class="section-title">用户管理</span>
      <n-button size="small" type="primary" @click="showAddModal = true">
        <template #icon><n-icon><PersonAdd /></n-icon></template>
        新增用户
      </n-button>
    </div>

    <n-data-table
      :columns="columns"
      :data="userStore.userList"
      :bordered="false"
      size="small"
    />

    <!-- 新增用户弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      title="新增用户"
      style="width: 380px"
      :mask-closable="false"
    >
      <n-form :model="form" label-placement="left" label-width="70px">
        <n-form-item label="用户名">
          <n-input v-model:value="form.username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="form.password"
            type="password"
            placeholder="请输入密码"
          />
        </n-form-item>
        <n-form-item label="角色">
          <n-select
            v-model:value="form.role"
            :options="[
              { label: '普通用户', value: 'user' },
              { label: '管理员', value: 'admin' },
            ]"
          />
        </n-form-item>
      </n-form>
      <n-space justify="end">
        <n-button @click="showAddModal = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleAdd">创建</n-button>
      </n-space>
    </n-modal>

    <!-- 修改密码弹窗 -->
    <n-modal
      v-model:show="showPwdModal"
      preset="card"
      title="修改密码"
      style="width: 360px"
      :mask-closable="false"
    >
      <n-form label-placement="left" label-width="70px">
        <n-form-item label="新密码">
          <n-input v-model:value="newPassword" type="password" placeholder="输入新密码" />
        </n-form-item>
      </n-form>
      <n-space justify="end">
        <n-button @click="showPwdModal = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleChangePwd">保存</n-button>
      </n-space>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, h, onMounted } from 'vue'
import { useMessage, useDialog, NButton, NTag, NSpace } from 'naive-ui'
import { PersonAdd } from '@vicons/ionicons5'
import { useUserStore } from '@/stores/userStore'

const message = useMessage()
const dialog = useDialog()
const userStore = useUserStore()

onMounted(() => { if (userStore.isAdmin) userStore.fetchUsers() })

const showAddModal = ref(false)
const showPwdModal = ref(false)
const editingUserId = ref(null)
const newPassword = ref('')
const saving = ref(false)

const form = ref({ username: '', password: '', role: 'user' })

const columns = [
  { title: '用户名', key: 'username' },
  {
    title: '角色',
    key: 'role',
    render: (row) =>
      h(NTag, { type: row.role === 'admin' ? 'warning' : 'default', size: 'small' }, () =>
        row.role === 'admin' ? '管理员' : '普通用户',
      ),
  },
  { title: '创建时间', key: 'createdAt', render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作',
    key: 'actions',
    render: (row) =>
      h(NSpace, { size: 'small' }, () => [
        h(
          NButton,
          {
            size: 'tiny',
            onClick: () => {
              editingUserId.value = row.id
              newPassword.value = ''
              showPwdModal.value = true
            },
          },
          () => '改密码',
        ),
        row.id !== 'admin'
          ? h(
              NButton,
              {
                size: 'tiny',
                type: 'error',
                onClick: () => handleDelete(row),
              },
              () => '删除',
            )
          : null,
      ]),
  },
]

async function handleAdd() {
  if (!form.value.username.trim() || !form.value.password.trim()) {
    message.warning('用户名和密码不能为空')
    return
  }
  saving.value = true
  const res = await userStore.createUser(form.value.username.trim(), form.value.password, form.value.role)
  saving.value = false
  if (res.ok) {
    message.success('用户创建成功')
    showAddModal.value = false
    form.value = { username: '', password: '', role: 'user' }
  } else {
    message.error(res.msg || '创建失败')
  }
}

async function handleChangePwd() {
  if (!newPassword.value.trim()) {
    message.warning('请输入新密码')
    return
  }
  saving.value = true
  const ok = await userStore.changePassword(editingUserId.value, newPassword.value)
  saving.value = false
  if (ok) {
    message.success('密码已修改')
    showPwdModal.value = false
  } else {
    message.error('修改失败')
  }
}

function handleDelete(row) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除用户 "${row.username}" ？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const result = await userStore.deleteUser(row.id)
      if (result === true) message.success('已删除')
      else message.error(typeof result === 'string' ? result : '删除失败')
    },
  })
}
</script>

<style scoped>
.user-manager {
  padding: 4px 0;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
